import { query } from '@anthropic-ai/claude-code';

import { Recipe } from '~/types/recipe';
import {
  CodeChangesEventHandlers,
  executeCodeChangesOperation,
} from '~/utils/code-changes-events.utils';
import { Logger } from '~/utils/logger.utils';
import { loadTemplate, renderPrompt } from '~/utils/prompts.utils';

import { extractErrorMessage } from './error.utils';

const DEFAULT_AI_MODEL = 'sonnet';

export class CodeSampleValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'CodeSampleValidationError';
  }
}

export async function performCodeSampleValidation(
  recipe: Recipe,
  recipePath: string,
  onProgress?: (message: string | null, isThinking?: boolean) => void
): Promise<string> {
  try {
    return await validateRecipeFixContent(
      recipe.metadata.id,
      recipePath,
      onProgress
    );
  } catch (error) {
    throw new CodeSampleValidationError(
      `Code sample validation failed: ${extractErrorMessage(error)}`,
      'VALIDATION_FAILED'
    );
  }
}

async function validateRecipeFixContent(
  recipeName: string,
  recipePath: string,
  onProgress?: (message: string | null, isThinking?: boolean) => void
): Promise<string> {
  try {
    onProgress?.('Analyzing code samples with AI', true);
    const template = loadTemplate('validation/code_sample_validation');
    const prompt = renderPrompt(template, {
      recipeName,
      recipePath,
    });

    Logger.info('AI validation prompt details');

    let responseText = '';

    const handlers: CodeChangesEventHandlers = {
      onProgress: (message) => {
        onProgress?.(message || 'Processing AI validation', false);
      },
      onThinkingStateChange: (isThinking) => {
        onProgress?.(null, isThinking);
      },
      onComplete: () => {
        onProgress?.('AI validation complete', false);
      },
      onError: (error) => {
        throw new CodeSampleValidationError(
          `AI validation failed: ${extractErrorMessage(error)}`,
          'AI_VALIDATION_FAILED'
        );
      },
      showChorenzoOperations: true,
    };

    const operationStartTime = new Date();
    const operationResult = await executeCodeChangesOperation(
      query({
        prompt,
        options: {
          model: DEFAULT_AI_MODEL,
          allowedTools: ['Read', 'LS'],
          permissionMode: 'bypassPermissions',
          cwd: recipePath,
        },
      }),
      handlers,
      operationStartTime
    );

    if (!operationResult.success) {
      Logger.error('AI validation operation failed');
      throw new CodeSampleValidationError(
        operationResult.error || 'AI validation failed',
        'AI_VALIDATION_FAILED'
      );
    }

    responseText = String(operationResult.result || '');

    Logger.info('AI validation completed successfully');

    return responseText;
  } catch (error) {
    throw new CodeSampleValidationError(
      `AI validation failed: ${extractErrorMessage(error)}`,
      'AI_VALIDATION_FAILED'
    );
  }
}
