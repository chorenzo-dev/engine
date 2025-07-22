import { SDKMessage } from '@anthropic-ai/claude-code';
import { CodeChangesOperation } from '../components/CodeChangesProgress';

export interface CodeChangesEventHandlers {
  onProgress?: (step: string) => void;
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

  try {
    for await (const message of operationPromise) {
      if (message.type === 'result') {
        sdkResultMetadata = message;
        if (message.subtype === 'success' && 'result' in message) {
          result = message.result;
          success = true;
        } else if (message.subtype && message.subtype.startsWith('error')) {
          errorMessage = 'error' in message ? String((message as any).error) : 'Unknown error occurred';
          success = false;
        }
        break;
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