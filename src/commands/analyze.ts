import { query, type SDKMessage } from '@anthropic-ai/claude-code';
import { findGitRoot, getProjectIdentifier } from '../utils/git.utils';
import { buildFileTree } from '../utils/file-tree.utils';
import { loadPrompt, renderPrompt } from '../utils/prompts.utils';
import { WorkspaceAnalysis } from '../types/analysis';
import * as fs from 'fs';
import * as path from 'path';

interface AnalysisResult {
  analysis: WorkspaceAnalysis | null;
  metadata?: {
    type: string;
    subtype: string;
    cost_usd: number;
    turns: number;
  };
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

  const result = {
    analysis: analysis ? snakeToCamelCase<WorkspaceAnalysis>(analysis) : null,
    metadata: sdkResultMetadata ? {
      type: sdkResultMetadata.type,
      subtype: sdkResultMetadata.subtype,
      cost_usd: sdkResultMetadata.total_cost_usd || 0,
      turns: sdkResultMetadata.num_turns || 0
    } : undefined
  };

  if (result.analysis) {
    const analysisPath = path.join(process.cwd(), '.chorenzo', 'analysis.json');
    fs.mkdirSync(path.dirname(analysisPath), { recursive: true });
    fs.writeFileSync(analysisPath, JSON.stringify(result.analysis, null, 2));
  }

  return result;
}