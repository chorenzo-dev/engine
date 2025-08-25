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

export class CodeSampleReviewError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'CodeSampleReviewError';
  }
}

export async function performCodeSampleReview(
  recipe: Recipe,
  recipePath: string,
  onProgress?: (message: string | null, isThinking?: boolean) => void
): Promise<string> {
  try {
    return await reviewRecipeContent(
      recipe.metadata.id,
      recipePath,
      onProgress
    );
  } catch (error) {
    throw new CodeSampleReviewError(
      `Code sample review failed: ${extractErrorMessage(error)}`,
      'REVIEW_FAILED'
    );
  }
}

async function reviewRecipeContent(
  recipeName: string,
  recipePath: string,
  onProgress?: (message: string | null, isThinking?: boolean) => void
): Promise<string> {
  try {
    onProgress?.('Reviewing recipe content with AI', true);
    const template = loadTemplate('validation/code_sample_review');
    const prompt = renderPrompt(template, {
      recipeName,
      recipePath,
    });

    Logger.info('AI review prompt details');

    let responseText = '';

    const handlers: CodeChangesEventHandlers = {
      onProgress: (message) => {
        onProgress?.(message || 'Processing AI review', false);
      },
      onThinkingStateChange: (isThinking) => {
        onProgress?.(null, isThinking);
      },
      onComplete: () => {
        onProgress?.('AI review complete', false);
      },
      onError: (error) => {
        throw new CodeSampleReviewError(
          `AI review failed: ${extractErrorMessage(error)}`,
          'AI_REVIEW_FAILED'
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
      Logger.error('AI review operation failed');
      throw new CodeSampleReviewError(
        operationResult.error || 'AI review failed',
        'AI_REVIEW_FAILED'
      );
    }

    responseText = String(operationResult.result || '');

    Logger.info('AI review completed successfully');

    return responseText;
  } catch (error) {
    throw new CodeSampleReviewError(
      `AI review failed: ${extractErrorMessage(error)}`,
      'AI_REVIEW_FAILED'
    );
  }
}
