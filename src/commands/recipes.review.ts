import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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
import { cloneRepository } from '~/utils/git-operations.utils';
import { normalizeRepoIdentifier } from '~/utils/git.utils';
import { libraryManager } from '~/utils/library-manager.utils';
import { resolvePath } from '~/utils/path.utils';
import {
  findRecipeDirectories,
  parseRecipeFromDirectory,
} from '~/utils/recipe.utils';

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
        return await reviewLibrary(
          resolvedTarget,
          baseContext,
          onProgress,
          handleReview
        );
      case InputType.GitUrl:
        return await reviewGitRepository(
          resolvedTarget,
          baseContext,
          onProgress,
          handleReview
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
    if (error instanceof CodeSampleValidationError) {
      const errorMsg = `AI review failed for '${recipe.metadata.id}': ${extractErrorMessage(error)}`;
      messages.push({ type: 'warning', text: errorMsg });
      onReview?.('warning', errorMsg);
      totalWarnings++;
    } else {
      const errorMsg = `Review failed for '${recipe.metadata.id}': ${extractErrorMessage(error)}`;
      messages.push({ type: 'error', text: errorMsg });
      onReview?.('error', errorMsg);
      totalErrors++;
    }
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

async function reviewLibrary(
  libraryPath: string,
  context: Omit<ReviewContext, 'recipesReviewed'>,
  onProgress?: ProgressCallback,
  onReview?: ReviewCallback
): Promise<ReviewResult> {
  onProgress?.(`Scanning library: ${libraryPath}`);

  if (!fs.existsSync(libraryPath)) {
    throw new RecipesError(
      `Library path does not exist: ${libraryPath}`,
      'LIBRARY_NOT_FOUND'
    );
  }

  const recipeDirectories = await findRecipeDirectories(libraryPath);
  if (recipeDirectories.length === 0) {
    throw new RecipesError(
      `No recipes found in library: ${libraryPath}`,
      'NO_RECIPES_FOUND'
    );
  }

  onProgress?.(`Found ${recipeDirectories.length} recipes to review`);

  const messages: ReviewMessage[] = [];
  const reviewedRecipeIds: string[] = [];
  let totalWarnings = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  for (const recipeDir of recipeDirectories) {
    const recipePath = path.join(libraryPath, recipeDir);

    try {
      onProgress?.(`Reviewing recipe: ${recipeDir}`);

      const recipe = parseRecipeFromDirectory(recipePath);
      const recipeId = recipe.metadata.id;
      reviewedRecipeIds.push(recipeId);

      try {
        const codeSampleValidation = await performCodeSampleValidation(recipe);

        if (codeSampleValidation.violations.length > 0) {
          const violationMessages = codeSampleValidation.violations.map(
            (violation) => {
              return `${violation.file}:${violation.line} (${violation.type}): ${violation.description}`;
            }
          );

          const issuesText = `${recipeId} code sample issues:\n${violationMessages.map((v) => `  - ${v}`).join('\n')}`;

          messages.push({
            type: 'warning',
            text: issuesText,
          });
          messages.push({ type: 'error', text: `${recipeId}:` });
          totalWarnings++;
          totalFailed++;
          onReview?.('warning', issuesText);
          onReview?.('error', recipeId);
        } else {
          messages.push({ type: 'success', text: recipeId });
          totalPassed++;
          onReview?.('success', recipeId);
        }
      } catch (error) {
        if (error instanceof CodeSampleValidationError) {
          const errorMsg = `${recipeId} AI review failed: ${extractErrorMessage(error)}`;
          messages.push({ type: 'warning', text: errorMsg });
          onReview?.('warning', errorMsg);
          totalWarnings++;
          totalFailed++;
        } else {
          const errorMsg = `${recipeId} review failed: ${extractErrorMessage(error)}`;
          messages.push({ type: 'error', text: errorMsg });
          onReview?.('error', errorMsg);
          totalFailed++;
        }
      }
    } catch (parseError) {
      const errorMsg = `Failed to parse recipe '${recipeDir}': ${extractErrorMessage(parseError)}`;
      messages.push({ type: 'error', text: errorMsg });
      onReview?.('error', errorMsg);
      totalFailed++;
    }
  }

  const summary: ReviewSummary = {
    total: recipeDirectories.length,
    passed: totalPassed,
    failed: totalFailed,
    warnings: totalWarnings,
  };

  return {
    context: {
      ...context,
      recipesReviewed: reviewedRecipeIds,
    },
    messages,
    summary,
  };
}

async function reviewGitRepository(
  repoUrl: string,
  context: Omit<ReviewContext, 'recipesReviewed'>,
  onProgress?: ProgressCallback,
  onReview?: ReviewCallback
): Promise<ReviewResult> {
  onProgress?.(`Cloning repository: ${repoUrl}`);

  const repoIdentifier = normalizeRepoIdentifier(repoUrl);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chorenzo-review-'));
  const clonePath = path.join(tempDir, repoIdentifier);

  try {
    await cloneRepository(repoUrl, clonePath, 'main');
    onProgress?.('Repository cloned successfully');

    const updatedContext = {
      ...context,
      resolvedPath: clonePath,
    };

    return await reviewLibrary(clonePath, updatedContext, onProgress, onReview);
  } catch (error) {
    throw new RecipesError(
      `Failed to clone or review repository: ${extractErrorMessage(error)}`,
      'GIT_CLONE_FAILED'
    );
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}
