import { query, type SDKMessage } from '@anthropic-ai/claude-code';
import { findGitRoot, getProjectIdentifier } from '../utils/git.utils';
import { buildFileTree } from '../utils/file-tree.utils';
import { loadPrompt, renderPrompt } from '../utils/prompts.utils';
import { WorkspaceAnalysis } from '../types/analysis';
import { validateFrameworks } from '../utils/framework-validation';
import { readJson, writeJson } from '../utils/json.utils';
import * as fs from 'fs';
import * as path from 'path';

const ANALYSIS_PATH = path.join(process.cwd(), '.chorenzo', 'analysis.json');

export interface AnalysisResult {
  analysis: WorkspaceAnalysis | null;
  metadata?: {
    type: string;
    subtype: string;
    costUsd: number;
    turns: number;
    durationSeconds: number;
  };
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
  
  onProgress?.('Finding git repository...');
  const workspaceRoot = await findGitRoot().catch(() => process.cwd());
  
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
        analysis = JSON.parse(message.result);
      }
      break;
    }
  }

  let finalAnalysis = analysis ? snakeToCamelCase<WorkspaceAnalysis>(analysis) : null;
  let totalCost = sdkResultMetadata?.total_cost_usd || 0;
  let totalTurns = sdkResultMetadata?.num_turns || 0;
  let unrecognizedFrameworks: string[] = [];

  if (finalAnalysis) {
    onProgress?.('Validating frameworks...');
    try {
      const { validatedAnalysis, unrecognizedFrameworks: unrecognized } = await validateFrameworks(finalAnalysis);
      finalAnalysis = validatedAnalysis;
      unrecognizedFrameworks = unrecognized;
      
      if (unrecognizedFrameworks.length > 0) {
        onProgress?.(`Warning: ${unrecognizedFrameworks.length} frameworks not recognized: ${unrecognizedFrameworks.join(', ')}`);
      }
    } catch (error) {
      console.error('Framework validation error:', error);
      onProgress?.('Warning: Framework validation failed');
    }
  }

  const durationSeconds = (Date.now() - startTime) / 1000;
  
  const result: AnalysisResult = {
    analysis: finalAnalysis,
    metadata: sdkResultMetadata ? {
      type: sdkResultMetadata.type,
      subtype: sdkResultMetadata.subtype,
      costUsd: totalCost,
      turns: totalTurns,
      durationSeconds
    } : undefined,
    unrecognizedFrameworks: unrecognizedFrameworks.length > 0 ? unrecognizedFrameworks : undefined
  };

  if (result.analysis) {
    fs.mkdirSync(path.dirname(ANALYSIS_PATH), { recursive: true });
    await writeJson(ANALYSIS_PATH, result.analysis);
  }

  return result;
}