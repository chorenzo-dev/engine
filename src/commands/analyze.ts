import { query } from '@anthropic-ai/claude-code';
import * as fs from 'fs';
import * as path from 'path';

import { WorkspaceAnalysis } from '~/types/analysis';
import { OperationMetadata } from '~/types/common';
import {
  CodeChangesEventHandlers,
  executeCodeChangesOperation,
} from '~/utils/code-changes-events.utils';
import { buildFileTree } from '~/utils/file-tree.utils';
import { validateFrameworks } from '~/utils/framework-validation';
import { findGitRoot } from '~/utils/git.utils';
import { readJson, writeJson } from '~/utils/json.utils';
import { Logger } from '~/utils/logger.utils';
import { loadPrompt, renderPrompt } from '~/utils/prompts.utils';
import { workspaceConfig } from '~/utils/workspace-config.utils';

import { CiCdSystem, Ecosystem, ProjectType } from '../types/analysis';
import { extractErrorMessage, formatErrorMessage } from '../utils/error.utils';
import { ProgressCallback } from './recipes.shared';

const ANALYSIS_PATH = workspaceConfig.getAnalysisPath();

export interface AnalysisResult {
  analysis: WorkspaceAnalysis | null;
  metadata?: OperationMetadata;
  unrecognizedFrameworks?: string[];
}

export async function performAnalysis(
  onProgress?: ProgressCallback
): Promise<AnalysisResult> {
  const startTime = new Date();
  Logger.info(
    {
      event: 'analysis_started',
      command: 'analyze',
    },
    'Workspace analysis started'
  );

  onProgress?.('Finding git repository');
  const workspaceRoot = findGitRoot();

  onProgress?.('Building file tree');
  const filesStructureSummary = await buildFileTree(workspaceRoot);

  onProgress?.('Loading analysis prompt');
  const promptTemplate = loadPrompt('analyze_workspace');
  const prompt = renderPrompt(promptTemplate, {
    workspace_root: workspaceRoot,
    files_structure_summary: filesStructureSummary,
    project_types: Object.values(ProjectType)
      .map((v) => `"${v}"`)
      .join(' | '),
    ecosystems: Object.values(Ecosystem)
      .map((v) => `"${v}"`)
      .join(' | '),
    cicd_systems: Object.values(CiCdSystem)
      .map((v) => `"${v}"`)
      .join(' | '),
  });

  onProgress?.('Analyzing workspace with Claude');

  let analysis = null;
  let errorMessage: string | undefined;

  const handlers: CodeChangesEventHandlers = {
    onProgress: (step) => onProgress?.(step, false),
    onThinkingStateChange: (isThinking) => {
      onProgress?.(null, isThinking);
    },
    onComplete: async () => {
      try {
        if (fs.existsSync(ANALYSIS_PATH)) {
          analysis = await readJson(ANALYSIS_PATH);
        } else {
          errorMessage = 'Analysis file was not created by Claude';
          analysis = null;
          Logger.error(
            {
              event: 'analysis_file_not_found',
              analysisPath: ANALYSIS_PATH,
            },
            'Claude did not write analysis file'
          );
        }
      } catch (error) {
        errorMessage = formatErrorMessage(
          'Failed to read analysis file',
          error
        );
        analysis = null;
        Logger.error(
          {
            event: 'analysis_file_read_error',
            error: errorMessage,
            analysisPath: ANALYSIS_PATH,
          },
          'Failed to read analysis file written by Claude'
        );
      }
    },
    onError: (error) => {
      errorMessage = extractErrorMessage(error);
      Logger.error(
        {
          event: 'analysis_claude_execution_error',
          error: error.message,
        },
        'Claude execution failed during analysis'
      );
    },
  };

  const operationResult = await executeCodeChangesOperation(
    query({
      prompt,
      options: {
        model: 'sonnet',
        maxTurns: 50,
        allowedTools: [
          'Read',
          'LS',
          'Glob',
          'Grep',
          'Write',
          'Bash(ls:*)',
          'Bash(find:*)',
          'Bash(grep:*)',
          'Bash(npx chorenzo analysis validate*)',
        ],
        permissionMode: 'bypassPermissions',
      },
    }),
    handlers,
    startTime
  );

  let finalAnalysis = analysis as WorkspaceAnalysis | null;
  let totalCost = operationResult.metadata.costUsd;
  let totalTurns = operationResult.metadata.turns;
  let subtype = operationResult.success ? 'success' : 'error';

  let unrecognizedFrameworks: string[] = [];

  if (finalAnalysis && !errorMessage) {
    if (
      finalAnalysis.isMonorepo === undefined ||
      finalAnalysis.projects === undefined
    ) {
      errorMessage =
        'Invalid analysis response: missing required fields (isMonorepo or projects)';
      subtype = 'error';
      finalAnalysis = null;
      Logger.error(
        {
          event: 'analysis_validation_error',
          error: errorMessage,
          analysis: finalAnalysis,
        },
        'Analysis response missing required fields'
      );
    } else if (finalAnalysis.projects.length === 0) {
      errorMessage = 'No projects found in workspace';
      subtype = 'error';
      Logger.error(
        {
          event: 'analysis_no_projects_error',
          error: errorMessage,
          workspaceInfo: {
            isMonorepo: finalAnalysis.isMonorepo,
            ecosystem: finalAnalysis.workspaceEcosystem,
          },
        },
        'No projects found during workspace analysis'
      );
      finalAnalysis = null;
    } else {
      onProgress?.('Validating frameworks');
      try {
        const { validatedAnalysis, unrecognizedFrameworks: unrecognized } =
          await validateFrameworks(finalAnalysis);
        finalAnalysis = validatedAnalysis;
        unrecognizedFrameworks = unrecognized;

        if (unrecognizedFrameworks.length > 0) {
          const warningMessage = `${unrecognizedFrameworks.length} frameworks not recognized: ${unrecognizedFrameworks.join(', ')}`;
          onProgress?.(`Warning: ${warningMessage}`);
          Logger.warn(
            {
              event: 'analysis_unrecognized_frameworks',
              unrecognizedFrameworks,
              count: unrecognizedFrameworks.length,
            },
            warningMessage
          );
        }
      } catch (error) {
        const validationError = 'Framework validation failed';
        onProgress?.(`Warning: ${validationError}`);
        Logger.warn(
          {
            event: 'analysis_framework_validation_error',
            error: extractErrorMessage(error),
          },
          validationError
        );
      }
    }
  }

  const durationSeconds = operationResult.metadata.durationSeconds;

  if (!finalAnalysis && !errorMessage) {
    errorMessage = 'Analysis completed but produced no valid data';
    subtype = 'error';
  }

  const isActualSuccess = !errorMessage && finalAnalysis !== null;
  const finalSubtype = errorMessage
    ? 'error'
    : finalAnalysis
      ? subtype
      : 'error';

  const result: AnalysisResult = {
    analysis: finalAnalysis,
    metadata: {
      type: 'result',
      subtype: finalSubtype,
      costUsd: totalCost,
      turns: totalTurns,
      durationSeconds,
      ...(errorMessage ? { error: errorMessage } : {}),
    },
    unrecognizedFrameworks:
      unrecognizedFrameworks.length > 0 ? unrecognizedFrameworks : undefined,
  };

  if (isActualSuccess && result.analysis) {
    fs.mkdirSync(path.dirname(ANALYSIS_PATH), { recursive: true });
    await writeJson(ANALYSIS_PATH, result.analysis);
    Logger.info(
      {
        event: 'analysis_completed',
        projectCount: result.analysis.projects.length,
        isMonorepo: result.analysis.isMonorepo,
        metadata: result.metadata,
      },
      'Analysis completed successfully'
    );
  } else {
    Logger.error(
      {
        event: 'analysis_failed',
        metadata: result.metadata,
        hasError: !!errorMessage,
        errorMessage: errorMessage || 'Analysis produced no valid data',
        hasAnalysis: !!result.analysis,
        operationSuccess: operationResult.success,
      },
      `Analysis failed - ${errorMessage || 'no valid analysis data produced'}`
    );
  }

  return result;
}
