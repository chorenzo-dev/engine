import { SDKMessage } from '@anthropic-ai/claude-code';
import { CodeChangesOperation } from '../components/CodeChangesProgress';
import { workspaceConfig } from '../utils/workspace-config.utils';
import * as os from 'os';

export interface CodeChangesEventHandlers {
  onProgress?: (step: string) => void;
  onThinkingStateChange?: (isThinking: boolean) => void;
  onComplete?: (result: any, metadata?: CodeChangesOperation['metadata']) => void;
  onError?: (error: Error) => void;
}

export interface CodeChangesOperationResult {
  success: boolean;
  result?: any;
  error?: string;
  metadata: {
    costUsd: number;
    turns: number;
    durationSeconds: number;
    subtype?: string;
  };
}

export async function executeCodeChangesOperation<T = any>(
  operationPromise: AsyncGenerator<SDKMessage, void, unknown>,
  handlers: CodeChangesEventHandlers,
  startTime: Date = new Date()
): Promise<CodeChangesOperationResult> {
  let sdkResultMetadata: SDKMessage | null = null;
  let result = null;
  let errorMessage: string | undefined;
  let success = false;

  handlers.onThinkingStateChange?.(true);

  try {
    for await (const message of operationPromise) {
      
      if (message.type === 'result') {
        handlers.onThinkingStateChange?.(false);
        sdkResultMetadata = message;
        if (message.subtype === 'success' && 'result' in message) {
          result = message.result;
          success = true;
        } else if (message.subtype && message.subtype.startsWith('error')) {
          errorMessage = 'error' in message ? String((message as any).error) : 'Unknown error occurred';
          success = false;
        }
        break;
      } else {
        if (message.type === 'assistant' && 'message' in message) {
          const assistantMessage = message.message as any;
          if (assistantMessage.content) {
            for (const content of assistantMessage.content) {
              if (content.type === 'tool_use') {
                const toolMessage = formatToolMessage(content.name, content.input);
                if (toolMessage) {
                  handlers.onThinkingStateChange?.(false);
                  handlers.onProgress?.(toolMessage);
                }
              }
            }
          }
        } else if (message.type === 'user' && 'message' in message) {
          handlers.onThinkingStateChange?.(true);
        }
      }
    }

    const endTime = new Date();
    const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
    
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

    const metadata = {
      costUsd: totalCost,
      turns: totalTurns,
      durationSeconds,
      subtype: success ? subtype : 'error',
    };

    if (success && result !== null) {
      handlers.onComplete?.(result, metadata);
      return {
        success: true,
        result,
        metadata,
      };
    } else {
      const error = new Error(errorMessage || 'Claude operation failed');
      handlers.onError?.(error);
      return {
        success: false,
        error: error.message,
        metadata,
      };
    }
  } catch (error) {
    const endTime = new Date();
    const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    const metadata = {
      costUsd: 0,
      turns: 0,
      durationSeconds,
      subtype: 'error',
    };

    handlers.onError?.(error instanceof Error ? error : new Error(errorMessage));
    return {
      success: false,
      error: errorMessage,
      metadata,
    };
  }
}

export function createProgressHandler(
  operationId: string,
  updateOperation: (id: string, updates: Partial<CodeChangesOperation>) => void
) {
  return (step: string) => {
    updateOperation(operationId, { 
      description: step,
      status: 'in_progress' 
    });
  };
}

export function createCompletionHandler(
  operationId: string,
  updateOperation: (id: string, updates: Partial<CodeChangesOperation>) => void,
  onComplete?: (result: any) => void
) {
  return (result: any, metadata?: CodeChangesOperation['metadata']) => {
    updateOperation(operationId, { 
      status: 'completed',
      metadata,
      endTime: new Date()
    });
    onComplete?.(result);
  };
}

export function createErrorHandler(
  operationId: string,
  updateOperation: (id: string, updates: Partial<CodeChangesOperation>) => void,
  onError?: (error: Error) => void
) {
  return (error: Error) => {
    updateOperation(operationId, { 
      status: 'error',
      error: error.message,
      endTime: new Date()
    });
    onError?.(error);
  };
}

export function generateOperationId(type: CodeChangesOperation['type']): string {
  return `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function formatToolMessage(toolName: string, input: any): string | null {
  if (toolName === 'TodoWrite' || toolName === 'TodoRead') {
    return null;
  }

  if (!input || typeof input !== 'object') {
    return `Using ${toolName} tool`;
  }

  switch (toolName) {
    case 'Read':
      const readPath = getRelativePath(input.file_path) || 'file';
      if (isChorenzoPath(readPath)) {
        return 'Updating Chorenzo context';
      }
      return `Reading ${readPath}`;
    
    case 'Write':
      const writePath = getRelativePath(input.file_path) || 'file';
      if (isChorenzoPath(writePath)) {
        return 'Updating Chorenzo context';
      }
      return `Writing ${writePath}`;
    
    case 'Edit':
    case 'MultiEdit':
      const editPath = getRelativePath(input.file_path) || 'file';
      if (isChorenzoPath(editPath)) {
        return 'Updating Chorenzo context';
      }
      return `Editing ${editPath}`;
    
    case 'Bash':
      const command = input.command || input.cmd || '';
      if (command.includes('mkdir') && command.includes('.chorenzo')) {
        return 'Updating Chorenzo context';
      }
      if (command.includes('mkdir')) {
        const pathMatch = command.match(/mkdir\s+(-p\s+)?["']?([^"'\s]+)["']?/);
        if (pathMatch && pathMatch[2]) {
          const relativePath = getRelativePath(pathMatch[2]);
          return `Creating directory: ${relativePath}`;
        }
      }
      if (command.includes('rm ') || command.includes('rmdir')) {
        const pathMatch = command.match(/(?:rm|rmdir)\s+(-[rf]+\s+)?["']?([^"'\s]+)["']?/);
        if (pathMatch && pathMatch[2]) {
          const relativePath = getRelativePath(pathMatch[2]);
          return `Removing: ${relativePath}`;
        }
      }
      return `Running: ${command}`;
    
    case 'LS':
      return `Listing ${getRelativePath(input.path) || 'directory'}`;
    
    case 'Glob':
      return `Finding files: ${input.pattern || 'pattern'}`;
    
    case 'Grep':
      return `Searching for: ${input.pattern || 'pattern'}`;
    
    case 'Task':
      return `Running task: ${input.description || 'background task'}`;
    
    default:
      return `Using ${toolName} tool`;
  }
}

function getRelativePath(filePath: string | undefined): string | undefined {
  if (!filePath) return filePath;
  
  const workspaceRoot = workspaceConfig.getWorkspaceRoot();
  
  if (filePath.startsWith(workspaceRoot)) {
    const relativePath = filePath.substring(workspaceRoot.length);
    return relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
  }
  
  const homeDir = os.homedir();
  if (filePath.startsWith(homeDir)) {
    const relativePath = filePath.substring(homeDir.length);
    return `~${relativePath}`;
  }
  
  return filePath;
}

function isChorenzoPath(filePath: string): boolean {
  if (!filePath) return false;
  
  return filePath.includes('.chorenzo');
}