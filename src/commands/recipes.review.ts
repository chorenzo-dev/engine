import * as fs from 'fs';

import { Recipe } from '~/types/recipe';
import {
  ReviewCallback,
  ReviewContext,
  ReviewMessage,
  ReviewOptions,
  ReviewResult,
  ReviewSummary,
} from '~/types/recipe-review';
import {
  CodeSampleValidationError,
  performCodeSampleValidation,
} from '~/utils/ai-validation.utils';
import { chorenzoConfig } from '~/utils/config.utils';
import { libraryManager } from '~/utils/library-manager.utils';
import { resolvePath } from '~/utils/path.utils';
import { parseRecipeFromDirectory } from '~/utils/recipe.utils';

import { extractErrorMessage } from '../utils/error.utils';
import {
  InputType,
  ProgressCallback,
  RecipesError,
  detectInputType,
} from './recipes.shared';

interface ErrorHandlingStats {
  totalErrors: number;
  totalWarnings: number;
  totalFailed: number;
}

function handleRecipeReviewError(
  error: unknown,
  recipeId: string,
  messages: ReviewMessage[],
  onReview: ReviewCallback | undefined,
  stats: ErrorHandlingStats
): void {
  if (error instanceof CodeSampleValidationError) {
    const errorMsg = recipeId.startsWith("'")
      ? `AI review failed for ${recipeId}: ${extractErrorMessage(error)}`
      : `${recipeId} AI review failed: ${extractErrorMessage(error)}`;
    messages.push({ type: 'warning', text: errorMsg });
    onReview?.('warning', errorMsg);
    stats.totalWarnings++;
    stats.totalFailed++;
  } else {
    const errorMsg = recipeId.startsWith("'")
      ? `Review failed for ${recipeId}: ${extractErrorMessage(error)}`
      : `${recipeId} review failed: ${extractErrorMessage(error)}`;
    messages.push({ type: 'error', text: errorMsg });
    onReview?.('error', errorMsg);
    stats.totalErrors++;
    stats.totalFailed++;
  }
}

export type { ReviewResult } from '~/types/recipe-review';

export async function performRecipesReview(
  options: ReviewOptions,
  onProgress?: ProgressCallback
): Promise<ReviewResult> {
  if (!options.target) {
    throw new RecipesError(
      'Target parameter is required for review',
      'MISSING_TARGET'
    );
  }

  const inputType = detectInputType(options.target);
  const resolvedTarget =
    inputType === InputType.RecipeName || inputType === InputType.GitUrl
      ? options.target
      : resolvePath(options.target);
  onProgress?.(`Reviewing: ${resolvedTarget}`);

  const messages: ReviewMessage[] = [];
  const handleReview: ReviewCallback = (type, message) => {
    messages.push({ type, text: message });
    onProgress?.(message);
  };

  try {
    const baseContext = {
      inputType,
      target: options.target,
      resolvedPath: resolvedTarget,
    };

    switch (inputType) {
      case InputType.RecipeName:
        return await reviewRecipeByName(
          resolvedTarget,
          baseContext,
          onProgress,
          handleReview
        );
      case InputType.RecipeFolder:
        return await reviewRecipeFolder(
          resolvedTarget,
          baseContext,
          onProgress,
          handleReview
        );
      case InputType.Library:
        throw new RecipesError(
          'Library review is not supported. Please specify a specific recipe name or path.',
          'LIBRARY_NOT_SUPPORTED'
        );
      case InputType.GitUrl:
        throw new RecipesError(
          'Git repository review is not supported. Please specify a specific recipe name or path.',
          'GIT_URL_NOT_SUPPORTED'
        );
      default:
        throw new RecipesError(
          `Unknown input type for: ${options.target}`,
          'UNKNOWN_INPUT_TYPE'
        );
    }
  } catch (error) {
    if (error instanceof RecipesError) {
      throw error;
    }
    throw new RecipesError(extractErrorMessage(error), 'REVIEW_FAILED');
  }
}

async function reviewRecipeByName(
  recipeName: string,
  context: Omit<ReviewContext, 'recipesReviewed'>,
  onProgress?: ProgressCallback,
  onReview?: ReviewCallback
): Promise<ReviewResult> {
  onProgress?.(`Searching for recipe: ${recipeName}`);

  const foundPaths = await libraryManager.findRecipeByName(recipeName);

  if (foundPaths.length === 0) {
    throw new RecipesError(
      `Recipe '${recipeName}' not found in ${chorenzoConfig.recipesDir}`,
      'RECIPE_NOT_FOUND'
    );
  }

  if (foundPaths.length > 1) {
    const pathsList = foundPaths.map((p) => `  - ${p}`).join('\n');
    throw new RecipesError(
      `Multiple recipes named '${recipeName}' found:\n${pathsList}\nPlease specify the full path.`,
      'MULTIPLE_RECIPES_FOUND'
    );
  }

  const recipePath = foundPaths[0];
  if (!recipePath) {
    throw new RecipesError(
      `Recipe path not found for '${recipeName}'`,
      'RECIPE_PATH_NOT_FOUND'
    );
  }

  return reviewRecipeFolder(recipePath, context, onProgress, onReview);
}

async function reviewRecipeFolder(
  recipePath: string,
  context: Omit<ReviewContext, 'recipesReviewed'>,
  onProgress?: ProgressCallback,
  onReview?: ReviewCallback
): Promise<ReviewResult> {
  onProgress?.(`Loading recipe from: ${recipePath}`);

  if (!fs.existsSync(recipePath)) {
    throw new RecipesError(
      `Recipe path does not exist: ${recipePath}`,
      'RECIPE_NOT_FOUND'
    );
  }

  let recipe: Recipe;
  try {
    recipe = parseRecipeFromDirectory(recipePath);
  } catch (error) {
    throw new RecipesError(
      `Failed to parse recipe: ${extractErrorMessage(error)}`,
      'RECIPE_PARSE_FAILED'
    );
  }

  onProgress?.(`Reviewing recipe: ${recipe.metadata.id}`);

  const messages: ReviewMessage[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;
  let codeSampleValidation;

  try {
    codeSampleValidation = await performCodeSampleValidation(recipe);

    if (codeSampleValidation.violations.length > 0) {
      const violationMessages = codeSampleValidation.violations.map(
        (violation) => {
          return `${violation.file}:${violation.line} (${violation.type}): ${violation.description} - ${violation.suggestion}`;
        }
      );

      const issuesText = `Code Sample Issues:\n${violationMessages.map((v) => `  - ${v}`).join('\n')}`;

      messages.push({
        type: 'warning',
        text: issuesText,
      });
      totalWarnings++;
      onReview?.('warning', issuesText);
    } else {
      const successMsg = `Recipe '${recipe.metadata.id}' passed code sample review`;
      messages.push({
        type: 'success',
        text: successMsg,
      });
      onReview?.('success', successMsg);
    }
  } catch (error) {
    const stats = { totalErrors, totalWarnings, totalFailed: 0 };
    handleRecipeReviewError(
      error,
      `'${recipe.metadata.id}'`,
      messages,
      onReview,
      stats
    );
    totalErrors = stats.totalErrors;
    totalWarnings = stats.totalWarnings;
  }

  const passed =
    totalErrors === 0 && codeSampleValidation?.violations.length === 0;
  const summary: ReviewSummary = {
    total: 1,
    passed: passed ? 1 : 0,
    failed: passed ? 0 : 1,
    warnings: totalWarnings,
  };

  return {
    context: {
      ...context,
      recipesReviewed: [recipe.metadata.id],
    },
    messages,
    summary,
  };
}
