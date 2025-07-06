import { query, type SDKMessage } from '@anthropic-ai/claude-code';
import { findGitRoot, getProjectIdentifier } from '../utils/git.utils';
import { buildFileTree } from '../utils/file-tree.utils';
import { loadPrompt, renderPrompt } from '../utils/prompts.utils';
import { WorkspaceAnalysis } from '../types/analysis';
import { validateFrameworks, createFrameworkClarificationPrompt } from '../utils/framework-validation';
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

async function clarifyFrameworks(
  sessionId: string,
  clarificationPrompt: string,
  onProgress?: ProgressCallback
): Promise<{ success: boolean; cost: number; turns: number }> {
  let cost = 0;
  let turns = 0;
  let success = false;

  for await (const message of query({
    prompt: clarificationPrompt,
    options: {
      resume: sessionId,
      allowedTools: ['Read', 'Edit'],
      permissionMode: 'bypassPermissions',
    },
  })) {
    if (message.type === 'result') {
      if (message.total_cost_usd) cost = message.total_cost_usd;
      if (message.num_turns) turns = message.num_turns;
      success = message.subtype === 'success';
    }
  }

  return { success, cost, turns };
}

export async function performAnalysis(onProgress?: ProgressCallback): Promise<AnalysisResult> {
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
  let sessionId: string | undefined;

  for await (const message of query({
    prompt,
    options: {
      model: 'sonnet',
      maxTurns: 10,
      allowedTools: ['Read', 'LS', 'Glob', 'Grep'],
      permissionMode: 'bypassPermissions',
    },
  })) {
    if (message.session_id) {
      sessionId = message.session_id;
    }
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
    const { validatedAnalysis, ambiguousFrameworks } = await validateFrameworks(finalAnalysis);
    
    if (ambiguousFrameworks.length > 0 && sessionId) {
      onProgress?.('Clarifying ambiguous frameworks...');
      const clarificationPrompt = createFrameworkClarificationPrompt(ambiguousFrameworks);
      
      const { success, cost, turns } = await clarifyFrameworks(sessionId, clarificationPrompt, onProgress);
      totalCost += cost;
      totalTurns += turns;
      
      if (success) {
        try {
          const updatedAnalysis = await readJson<WorkspaceAnalysis>(ANALYSIS_PATH);
          const { validatedAnalysis: revalidated, ambiguousFrameworks: stillAmbiguous } = await validateFrameworks(updatedAnalysis);
          
          if (stillAmbiguous.length === 0) {
            finalAnalysis = revalidated;
          } else {
            unrecognizedFrameworks = stillAmbiguous.map(f => f.originalFramework);
            onProgress?.(`Warning: ${stillAmbiguous.length} frameworks still unrecognized after clarification`);
            finalAnalysis = revalidated;
          }
        } catch (error) {
          onProgress?.('Warning: Could not read updated analysis file');
          finalAnalysis = validatedAnalysis;
        }
      } else {
        finalAnalysis = validatedAnalysis;
      }
    } else {
      finalAnalysis = validatedAnalysis;
    }
  }

  const result: AnalysisResult = {
    analysis: finalAnalysis,
    metadata: sdkResultMetadata ? {
      type: sdkResultMetadata.type,
      subtype: sdkResultMetadata.subtype,
      costUsd: totalCost,
      turns: totalTurns
    } : undefined,
    unrecognizedFrameworks: unrecognizedFrameworks.length > 0 ? unrecognizedFrameworks : undefined
  };

  if (result.analysis) {
    fs.mkdirSync(path.dirname(ANALYSIS_PATH), { recursive: true });
    await writeJson(ANALYSIS_PATH, result.analysis);
  }

  return result;
}