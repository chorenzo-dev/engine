import { query, type SDKMessage } from '@anthropic-ai/claude-code';
import { findGitRoot, getProjectIdentifier } from '../utils/git.utils';
import { buildFileTree } from '../utils/file-tree.utils';
import { loadPrompt, renderPrompt } from '../utils/prompts.utils';
import { WorkspaceAnalysis } from '../types/analysis';
import { OperationMetadata } from '../types/common';
import { validateFrameworks } from '../utils/framework-validation';
import { readJson, writeJson } from '../utils/json.utils';
import { Logger } from '../utils/logger.utils';
import * as fs from 'fs';
import * as path from 'path';

const ANALYSIS_PATH = path.join(process.cwd(), '.chorenzo', 'analysis.json');

export interface AnalysisResult {
  analysis: WorkspaceAnalysis | null;
  metadata?: OperationMetadata;
  unrecognizedFrameworks?: string[];
}

function snakeToCamelCase<T>(obj: unknown): T {
  if (Array.isArray(obj)) {
    return obj.map(snakeToCamelCase) as T;
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      (result as any)[camelKey] = snakeToCamelCase((obj as any)[key]);
      return result;
    }, {} as T);
  }
  return obj as T;
}

export type ProgressCallback = (step: string) => void;


export async function performAnalysis(onProgress?: ProgressCallback): Promise<AnalysisResult> {
  const startTime = Date.now();
  Logger.info({ 
    event: 'analysis_started',
    command: 'analyze'
  }, 'Workspace analysis started');
  
  onProgress?.('Finding git repository...');
  const workspaceRoot = findGitRoot();
  
  onProgress?.('Building file tree...');
  const filesStructureSummary = await buildFileTree(workspaceRoot);
  
  onProgress?.('Loading analysis prompt...');
  const promptTemplate = loadPrompt('analyze_workspace');
  const prompt = renderPrompt(promptTemplate, {
    workspace_root: workspaceRoot,
    files_structure_summary: filesStructureSummary
  });

  onProgress?.('Analyzing workspace with Claude...');
  let sdkResultMetadata: SDKMessage | null = null;
  let analysis = null;
  let errorMessage: string | undefined;

  for await (const message of query({
    prompt,
    options: {
      model: 'sonnet',
      maxTurns: 10,
      allowedTools: ['Read', 'LS', 'Glob', 'Grep'],
      permissionMode: 'bypassPermissions',
    },
  })) {
    if (message.type === 'result') {
      sdkResultMetadata = message;
      if (message.subtype === 'success' && 'result' in message) {
        try {
          analysis = JSON.parse(message.result);
        } catch (error) {
          errorMessage = `Invalid JSON response: ${error instanceof Error ? error.message : String(error)}`;
          analysis = null;
        }
      }
      break;
    }
  }

  let finalAnalysis = analysis ? snakeToCamelCase<WorkspaceAnalysis>(analysis) : null;
  let totalCost = 0;
  let totalTurns = 0;
  let subtype = 'error';
  
  if (sdkResultMetadata?.type === 'result') {
    if ('total_cost_usd' in sdkResultMetadata) {
      totalCost = sdkResultMetadata.total_cost_usd;
    }
    if ('num_turns' in sdkResultMetadata) {
      totalTurns = sdkResultMetadata.num_turns;
    }
    if ('subtype' in sdkResultMetadata) {
      subtype = sdkResultMetadata.subtype;
    }
  }
  
  let unrecognizedFrameworks: string[] = [];

  if (finalAnalysis && !errorMessage) {
    if (finalAnalysis.isMonorepo === undefined || finalAnalysis.projects === undefined) {
      errorMessage = 'Invalid analysis response: missing required fields (isMonorepo or projects)';
      subtype = 'error';
      finalAnalysis = null;
    } else if (finalAnalysis.projects.length === 0) {
      errorMessage = 'No projects found in workspace';
      subtype = 'error';
      finalAnalysis = null;
    } else {
      onProgress?.('Validating frameworks...');
      try {
        const { validatedAnalysis, unrecognizedFrameworks: unrecognized } = await validateFrameworks(finalAnalysis);
        finalAnalysis = validatedAnalysis;
        unrecognizedFrameworks = unrecognized;
        
        if (unrecognizedFrameworks.length > 0) {
          onProgress?.(`Warning: ${unrecognizedFrameworks.length} frameworks not recognized: ${unrecognizedFrameworks.join(', ')}`);
        }
      } catch (error) {
        onProgress?.('Warning: Framework validation failed');
      }
    }
  }

  const durationSeconds = (Date.now() - startTime) / 1000;
  
  const result: AnalysisResult = {
    analysis: finalAnalysis,
    metadata: {
      type: 'result',
      subtype: errorMessage ? 'error' : subtype,
      costUsd: totalCost,
      turns: totalTurns,
      durationSeconds,
      ...(errorMessage ? { error: errorMessage } : {})
    },
    unrecognizedFrameworks: unrecognizedFrameworks.length > 0 ? unrecognizedFrameworks : undefined
  };

  if (result.analysis) {
    fs.mkdirSync(path.dirname(ANALYSIS_PATH), { recursive: true });
    await writeJson(ANALYSIS_PATH, result.analysis);
  }

  return result;
}