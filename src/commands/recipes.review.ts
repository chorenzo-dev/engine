import * as fs from 'fs';

import { Recipe } from '~/types/recipe';
import {
  ReviewContext,
  ReviewOptions,
  ReviewResult,
} from '~/types/recipe-review';
import { performCodeSampleReview } from '~/utils/ai-review.utils';
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
          onProgress
        );
      case InputType.RecipeFolder:
        return await reviewRecipeFolder(
          resolvedTarget,
          baseContext,
          onProgress
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
  onProgress?: ProgressCallback
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

  return reviewRecipeFolder(recipePath, context, onProgress);
}

async function reviewRecipeFolder(
  recipePath: string,
  context: Omit<ReviewContext, 'recipesReviewed'>,
  onProgress?: ProgressCallback
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

  let report: string;

  try {
    report = await performCodeSampleReview(recipe, recipePath, onProgress);
  } catch (error) {
    throw new RecipesError(
      `Review failed for '${recipe.metadata.id}': ${extractErrorMessage(error)}`,
      'REVIEW_FAILED'
    );
  }

  return {
    context: {
      ...context,
      recipesReviewed: [recipe.metadata.id],
    },
    report,
  };
}
