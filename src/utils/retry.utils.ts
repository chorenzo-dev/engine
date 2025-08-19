import { extractErrorMessage } from './error.utils';

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export async function retry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 2, delayMs = 0, onRetry } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error(extractErrorMessage(error));

      if (attempt < maxAttempts) {
        onRetry?.(attempt, lastError);

        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
  }

  throw lastError || new Error('Operation failed with unknown error');
}
