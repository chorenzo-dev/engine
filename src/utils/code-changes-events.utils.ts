import { SDKMessage } from '@anthropic-ai/claude-code';
import * as os from 'os';

import { BaseMetadata, OperationMetadata } from '~/types/common';
import { workspaceConfig } from '~/utils/workspace-config.utils';

import { extractErrorMessage, formatErrorMessage } from './error.utils';
import { Logger } from './logger.utils';

const DEFAULT_TIMEOUT_MS = 300000;

function setupClaudeEnvironment(): void {
  const timeoutConfig = {
    MCP_TIMEOUT: DEFAULT_TIMEOUT_MS,
    MCP_TOOL_TIMEOUT: DEFAULT_TIMEOUT_MS,
    BASH_DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS,
    BASH_MAX_TIMEOUT_MS: DEFAULT_TIMEOUT_MS * 2,
    ANTHROPIC_SDK_TIMEOUT: DEFAULT_TIMEOUT_MS,
  };

  Object.entries(timeoutConfig).forEach(([key, value]) => {
    if (!process.env[key]) {
      process.env[key] = String(value);
      Logger.debug(`Setting ${key}=${value}ms for Claude SDK timeout`);
    }
  });

  Logger.info('Claude environment configured with extended timeouts');
}

export interface CodeChangesOperation {
  id: string;
  type: 'analysis' | 'apply' | 'init' | 'validation' | 'generate';
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  startTime?: Date;
  endTime?: Date;
  error?: string;
  currentActivity?: string;
  isThinking?: boolean;
  metadata?: Partial<OperationMetadata>;
}

interface BaseToolInput {
  [key: string]: unknown;
}

interface FileToolInput extends BaseToolInput {
  file_path: string;
}

interface BashToolInput extends BaseToolInput {
  command: string;
  cmd?: string;
}

interface SearchToolInput extends BaseToolInput {
  pattern: string;
}

interface PathToolInput extends BaseToolInput {
  path: string;
}

interface TaskToolInput extends BaseToolInput {
  description: string;
}

type ToolInput =
  | FileToolInput
  | BashToolInput
  | SearchToolInput
  | PathToolInput
  | TaskToolInput
  | BaseToolInput;

interface AssistantMessage {
  content: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
}

interface UserMessage {
  content: Array<{
    type: string;
    tool_use_id?: string;
    is_error?: boolean;
    [key: string]: unknown;
  }>;
}

export interface CodeChangesEventHandlers {
  onProgress?: (step: string) => void;
  onThinkingStateChange?: (isThinking: boolean) => void;
  onComplete?: (result: unknown, metadata?: Partial<OperationMetadata>) => void;
  onError?: (error: Error) => void;
  showChorenzoOperations?: boolean;
}

export interface CodeChangesOperationResult {
  success: boolean;
  result?: unknown;
  error?: string;
  metadata: BaseMetadata;
}

export async function executeCodeChangesOperation(
  operationPromise: AsyncGenerator<SDKMessage, void, unknown>,
  handlers: CodeChangesEventHandlers,
  startTime: Date = new Date()
): Promise<CodeChangesOperationResult> {
  setupClaudeEnvironment();

  let sdkResultMetadata: SDKMessage | null = null;
  let result = null;
  let errorMessage: string | undefined;
  let success = false;

  handlers.onThinkingStateChange?.(true);

  try {
    for await (const message of operationPromise) {
      Logger.debug(
        {
          event: 'claude_message_received',
          messageType: message.type,
          messageSubtype:
            (message as Record<string, unknown>)['subtype'] || 'none',
          hasContent: 'content' in message,
          hasMessage: 'message' in message,
        },
        `Claude message: ${message.type}`
      );

      if (message.type === 'result') {
        handlers.onThinkingStateChange?.(false);
        sdkResultMetadata = message;
        if (message.subtype === 'success' && 'result' in message) {
          result = message.result;
          success = true;
          Logger.info(
            {
              event: 'claude_execution_success',
              resultLength: message.result ? String(message.result).length : 0,
            },
            `Claude execution completed successfully. Result preview: ${String(message.result || '').substring(0, 200)}...`
          );
        } else if (message.subtype?.startsWith('error')) {
          const messageObj = message as Record<string, unknown>;

          if ('error' in messageObj) {
            errorMessage = String(messageObj['error']);
          } else if ('message' in messageObj) {
            errorMessage = String(messageObj['message']);
          } else if ('reason' in messageObj) {
            errorMessage = String(messageObj['reason']);
          } else {
            if ('content' in messageObj && messageObj['content']) {
              const content = messageObj['content'] as string;
              errorMessage =
                content.length > 500
                  ? content.substring(0, 500) + '...'
                  : content;
            } else {
              errorMessage = `Claude execution failed with ${message.subtype}`;
            }
          }

          Logger.error(
            {
              event: 'claude_execution_error_detailed',
              subtype: message.subtype,
              errorMessage,
              fullMessage: JSON.stringify(messageObj, null, 2).substring(
                0,
                1000
              ),
            },
            `Claude execution error: ${errorMessage}`
          );

          success = false;
        }
        break;
      } else {
        if (message.type === 'assistant' && 'message' in message) {
          const assistantMessage = message.message as AssistantMessage;
          if (assistantMessage.content) {
            for (const content of assistantMessage.content) {
              if (content.type === 'tool_use') {
                Logger.info(
                  {
                    event: 'claude_tool_use',
                    toolName: content['name'],
                    hasInput: !!content['input'],
                  },
                  `Claude tool use: ${content['name']}`
                );

                if (
                  content['name'] === 'Bash' &&
                  content['input'] &&
                  typeof content['input'] === 'object'
                ) {
                  const bashInput = content['input'] as BashToolInput;
                  if (bashInput.command) {
                    Logger.info(
                      {
                        event: 'claude_bash_command',
                        command: bashInput.command.substring(0, 200),
                      },
                      `Claude bash: ${bashInput.command}`
                    );
                  }
                }

                const toolMessage = formatToolMessage(
                  String(content['name']),
                  content['input'] as ToolInput,
                  handlers.showChorenzoOperations
                );
                if (toolMessage) {
                  handlers.onThinkingStateChange?.(false);
                  handlers.onProgress?.(toolMessage);
                }
              } else if (content.type === 'text') {
                Logger.debug(
                  {
                    event: 'claude_text_response',
                    textLength: content.text ? content.text.length : 0,
                  },
                  `Claude text: ${content.text ? content.text.substring(0, 200) : ''}...`
                );
              }
            }
          }
        } else if (message.type === 'user' && 'message' in message) {
          const userMessage = message.message as UserMessage;
          if (userMessage.content) {
            for (const content of userMessage.content) {
              if (content.type === 'tool_result') {
                Logger.debug(
                  {
                    event: 'claude_tool_result',
                    toolUseId: content.tool_use_id || 'unknown',
                    isError: content.is_error || false,
                    contentLength: content['content']
                      ? String(content['content']).length
                      : 0,
                  },
                  `Tool result: ${content.is_error ? 'error' : 'success'}`
                );
              }
            }
          }
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
      const finalErrorMessage =
        errorMessage ||
        'Claude operation failed without specific error details';
      Logger.error(
        {
          event: 'claude_operation_failed',
          hasErrorMessage: !!errorMessage,
          errorMessage: finalErrorMessage,
          totalCost,
          totalTurns,
          durationSeconds,
        },
        `Claude operation failed: ${finalErrorMessage}`
      );

      const error = new Error(finalErrorMessage);
      handlers.onError?.(error);
      return {
        success: false,
        error: formatErrorMessage('Claude operation failed', error),
        metadata,
      };
    }
  } catch (error) {
    const endTime = new Date();
    const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
    const errorMessage = extractErrorMessage(error);

    Logger.error(
      {
        event: 'code_changes_operation_exception',
        errorType:
          error instanceof Error ? error.constructor.name : typeof error,
        errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        durationSeconds,
      },
      `Code changes operation threw exception: ${errorMessage}`
    );

    const metadata = {
      costUsd: 0,
      turns: 0,
      durationSeconds,
      subtype: 'error',
    };

    const finalError = error instanceof Error ? error : new Error(errorMessage);
    handlers.onError?.(finalError);
    return {
      success: false,
      error: formatErrorMessage('Code changes operation failed', error),
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
      status: 'in_progress',
    });
  };
}

export function createCompletionHandler(
  operationId: string,
  updateOperation: (id: string, updates: Partial<CodeChangesOperation>) => void,
  onComplete?: (result: unknown) => void
) {
  return (result: unknown, metadata?: CodeChangesOperation['metadata']) => {
    updateOperation(operationId, {
      status: 'completed',
      metadata,
      endTime: new Date(),
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
      error: formatErrorMessage('Operation failed', error),
      endTime: new Date(),
    });
    onError?.(error);
  };
}

export function generateOperationId(
  type: CodeChangesOperation['type']
): string {
  return `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function formatToolMessage(
  toolName: string,
  input: ToolInput,
  showChorenzoOperations?: boolean
): string | null {
  if (toolName === 'TodoWrite' || toolName === 'TodoRead') {
    return null;
  }

  if (!input || typeof input !== 'object') {
    return `Using ${toolName} tool`;
  }

  switch (toolName) {
    case 'Read': {
      const fileInput = input as FileToolInput;
      const readPath = getRelativePath(fileInput.file_path) || 'file';
      if (isChorenzoPath(readPath) && !showChorenzoOperations) {
        return 'Updating Chorenzo context';
      }
      return `Reading ${readPath}`;
    }

    case 'Write': {
      const fileInput = input as FileToolInput;
      const writePath = getRelativePath(fileInput.file_path) || 'file';
      if (isChorenzoPath(writePath) && !showChorenzoOperations) {
        return 'Updating Chorenzo context';
      }
      return `Writing ${writePath}`;
    }

    case 'Edit':
    case 'MultiEdit': {
      const fileInput = input as FileToolInput;
      const editPath = getRelativePath(fileInput.file_path) || 'file';
      if (isChorenzoPath(editPath) && !showChorenzoOperations) {
        return 'Updating Chorenzo context';
      }
      return `Editing ${editPath}`;
    }

    case 'Bash': {
      const bashInput = input as BashToolInput;
      const command = bashInput.command || bashInput.cmd || '';
      if (command.includes('mkdir') && command.includes('.chorenzo')) {
        return 'Initializing the chorenzo engine';
      }
      if (command.includes('mkdir')) {
        const pathMatch = command.match(/mkdir\s+(-p\s+)?["']?([^"'\s]+)["']?/);
        if (pathMatch?.[2]) {
          const relativePath = getRelativePath(pathMatch[2]);
          return `Creating directory: ${relativePath}`;
        }
      }
      if (command.includes('rm ') || command.includes('rmdir')) {
        const pathMatch = command.match(
          /(?:rm|rmdir)\s+(-[rf]+\s+)?["']?([^"'\s]+)["']?/
        );
        if (pathMatch?.[2]) {
          const relativePath = getRelativePath(pathMatch[2]);
          return `Removing: ${relativePath}`;
        }
      }
      return `Running: ${command}`;
    }

    case 'LS': {
      const relativePath = getRelativePath((input as PathToolInput).path);
      let pathDisplay: string;
      if (relativePath === '') {
        pathDisplay = 'root directory';
      } else if (relativePath) {
        pathDisplay = relativePath;
      } else {
        pathDisplay = (input as PathToolInput).path || 'directory';
      }
      return `Listing ${pathDisplay}`;
    }

    case 'Glob':
      return `Finding files: ${(input as SearchToolInput).pattern || 'pattern'}`;

    case 'Grep':
      return `Searching for: ${(input as SearchToolInput).pattern || 'pattern'}`;

    case 'Task':
      return `Running task: ${(input as TaskToolInput).description || 'background task'}`;

    default:
      return `Using ${toolName} tool`;
  }
}

function getRelativePath(filePath: string | undefined): string | undefined {
  if (!filePath) {
    return filePath;
  }

  const workspaceRoot = workspaceConfig.getWorkspaceRoot();

  if (filePath.startsWith(workspaceRoot)) {
    const relativePath = filePath.substring(workspaceRoot.length);
    return relativePath.startsWith('/')
      ? relativePath.substring(1)
      : relativePath;
  }

  const homeDir = os.homedir();
  if (filePath.startsWith(homeDir)) {
    const relativePath = filePath.substring(homeDir.length);
    return `~${relativePath}`;
  }

  return filePath;
}

function isChorenzoPath(filePath: string): boolean {
  if (!filePath) {
    return false;
  }

  return filePath.includes('.chorenzo');
}
