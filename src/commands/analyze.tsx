import { query, type SDKMessage } from '@anthropic-ai/claude-code';
import { findGitRoot, getProjectIdentifier } from '../utils/git.utils';
import { buildFileTree } from '../utils/file-tree.utils';
import { loadPrompt, renderPrompt } from '../utils/prompts.utils';

interface AnalysisResult {
  analysis: any;
  metadata?: {
    type: string;
    subtype: string;
    cost_usd: number;
    turns: number;
  };
}

export async function performAnalysis(): Promise<AnalysisResult> {
  const workspaceRoot = await findGitRoot().catch(() => process.cwd());
  
  await getProjectIdentifier().catch((error) => {
    console.warn(`Warning: ${error.message}`);
  });

  const filesStructureSummary = await buildFileTree(workspaceRoot);
  const promptTemplate = loadPrompt('analyze_workspace');
  const prompt = renderPrompt(promptTemplate, {
    workspace_root: workspaceRoot,
    files_structure_summary: filesStructureSummary
  });

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

  return {
    analysis,
    metadata: sdkResultMetadata ? {
      type: sdkResultMetadata.type,
      subtype: sdkResultMetadata.subtype,
      cost_usd: sdkResultMetadata.total_cost_usd || 0,
      turns: sdkResultMetadata.num_turns || 0
    } : undefined
  };
}