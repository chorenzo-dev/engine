import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { chorenzoConfig } from '~/utils/config.utils';
import { cloneRepository } from '~/utils/git-operations.utils';
import { normalizeRepoIdentifier } from '~/utils/git.utils';
import { libraryManager } from '~/utils/library-manager.utils';
import { resolvePath } from '~/utils/path.utils';
import {
  findRecipeDirectories,
  parseRecipeFromDirectory,
} from '~/utils/recipe.utils';

import { extractErrorMessage, formatErrorMessage } from '../utils/error.utils';
import {
  InputType,
  ProgressCallback,
  RecipesError,
  detectInputType,
} from './recipes.shared';

export type ValidationCallback = (
  type: 'info' | 'success' | 'error' | 'warning',
  message: string
) => void;

export interface ValidateOptions extends Record<string, unknown> {
  target: string;
}

export interface ValidationMessage {
  type: 'info' | 'success' | 'error' | 'warning';
  text: string;
}

export interface ValidationSummary {
  total: number;
  valid: number;
  totalErrors: number;
  totalWarnings: number;
}

export interface ValidationContext {
  inputType: InputType;
  target: string;
  resolvedPath?: string;
  recipesValidated?: string[];
}

export interface ValidationResult {
  messages: ValidationMessage[];
  summary?: ValidationSummary;
  context: ValidationContext;
}

export async function performRecipesValidate(
  options: ValidateOptions,
  onProgress?: ProgressCallback
): Promise<ValidationResult> {
  if (!options.target) {
    throw new RecipesError(
      'Target parameter is required for validation',
      'MISSING_TARGET'
    );
  }

  const inputType = detectInputType(options.target);
  const resolvedTarget =
    inputType === InputType.RecipeName || inputType === InputType.GitUrl
      ? options.target
      : resolvePath(options.target);
  onProgress?.(`Validating: ${resolvedTarget}`);

  const messages: ValidationMessage[] = [];
  const handleValidation: ValidationCallback = (type, message) => {
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
        return await validateRecipeByName(
          resolvedTarget,
          options,
          baseContext,
          onProgress,
          handleValidation
        );
      case InputType.RecipeFolder:
        return validateRecipeFolder(
          resolvedTarget,
          options,
          baseContext,
          onProgress,
          handleValidation
        );
      case InputType.Library:
        return await validateLibrary(
          resolvedTarget,
          options,
          baseContext,
          onProgress,
          handleValidation
        );
      case InputType.GitUrl:
        return await validateGitRepository(
          resolvedTarget,
          options,
          baseContext,
          onProgress,
          handleValidation
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
    throw new RecipesError(extractErrorMessage(error), 'VALIDATION_FAILED');
  }
}

async function validateRecipeByName(
  recipeName: string,
  options: Record<string, unknown>,
  context: Omit<ValidationContext, 'recipesValidated'>,
  onProgress?: ProgressCallback,
  onValidation?: ValidationCallback
): Promise<ValidationResult> {
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

  return validateRecipeFolder(
    recipePath,
    options,
    context,
    onProgress,
    onValidation
  );
}

function validateRecipeFolder(
  recipePath: string,
  _options: Record<string, unknown>,
  context: Omit<ValidationContext, 'recipesValidated'>,
  onProgress?: ProgressCallback,
  onValidation?: ValidationCallback
): ValidationResult {
  onProgress?.(`Validating recipe folder: ${recipePath}`);

  try {
    const recipe = parseRecipeFromDirectory(recipePath);
    const result = recipe.validate();

    const messages: ValidationMessage[] = [];
    let totalErrors = 0;
    let totalWarnings = 0;

    const isOverallValid = result.valid;

    if (isOverallValid) {
      const msg = `Recipe '${recipe.getId()}' is valid`;
      messages.push({ type: 'success', text: msg });
      onValidation?.('success', msg);
    } else {
      const headerMsg = `Recipe '${recipe.getId()}' has validation errors:`;
      messages.push({ type: 'error', text: headerMsg });
      onValidation?.('error', headerMsg);

      for (const error of result.errors) {
        const errorMsg = `  - ${error.message}${error.file ? ` (${error.file})` : ''}`;
        messages.push({ type: 'error', text: errorMsg });
        onValidation?.('error', errorMsg);
        totalErrors++;
      }
    }

    if (result.warnings.length > 0) {
      const warningHeader = 'Warnings:';
      messages.push({ type: 'warning', text: warningHeader });
      onValidation?.('warning', warningHeader);

      for (const warning of result.warnings) {
        const warningMsg = `  - ${warning.message}${warning.file ? ` (${warning.file})` : ''}`;
        messages.push({ type: 'warning', text: warningMsg });
        onValidation?.('warning', warningMsg);
        totalWarnings++;
      }
    }

    const summary: ValidationSummary = {
      total: 1,
      valid: isOverallValid ? 1 : 0,
      totalErrors,
      totalWarnings,
    };

    return {
      messages,
      summary,
      context: {
        ...context,
        recipesValidated: [recipe.getId()],
      },
    };
  } catch (error) {
    throw new RecipesError(
      extractErrorMessage(error),
      'RECIPE_VALIDATION_FAILED'
    );
  }
}

async function validateLibrary(
  libraryPath: string,
  _options: Record<string, unknown>,
  context: Omit<ValidationContext, 'recipesValidated'>,
  onProgress?: ProgressCallback,
  onValidation?: ValidationCallback
): Promise<ValidationResult> {
  onProgress?.(`This will validate all recipes in the library: ${libraryPath}`);
  onProgress?.('This may take some time for large libraries.');

  try {
    const recipeDirectories = await findRecipeDirectories(libraryPath);

    const messages: ValidationMessage[] = [];
    let validCount = 0;
    let totalErrors = 0;
    let totalWarnings = 0;
    const validatedRecipeIds: string[] = [];

    for (const recipeDir of recipeDirectories) {
      const recipeDirName = path.basename(recipeDir);
      let recipe;

      try {
        recipe = await parseRecipeFromDirectory(recipeDir);
      } catch (error) {
        const recipeId = recipeDirName;
        validatedRecipeIds.push(recipeId);

        const headerMsg = `${recipeId}:`;
        messages.push({ type: 'error', text: headerMsg });
        onValidation?.('error', headerMsg);

        const errorMsg = `  - Recipe parsing failed: ${extractErrorMessage(error)}`;
        messages.push({ type: 'error', text: errorMsg });
        onValidation?.('error', errorMsg);
        totalErrors++;
        continue;
      }

      const recipeId = recipe.getId();
      validatedRecipeIds.push(recipeId);

      const result = recipe.validate();

      const isOverallValid = result.valid;

      if (isOverallValid) {
        validCount++;
        messages.push({ type: 'success', text: recipeId });
        onValidation?.('success', recipeId);
      } else {
        const headerMsg = `${recipeId}:`;
        messages.push({ type: 'error', text: headerMsg });
        onValidation?.('error', headerMsg);

        for (const error of result.errors) {
          const errorMsg = `  - ${error.message}${error.file ? ` (${error.file})` : ''}`;
          messages.push({ type: 'error', text: errorMsg });
          onValidation?.('error', errorMsg);
          totalErrors++;
        }
      }

      if (result.warnings.length > 0) {
        const warningHeader = `${recipeId} warnings:`;
        messages.push({ type: 'warning', text: warningHeader });
        onValidation?.('warning', warningHeader);

        for (const warning of result.warnings) {
          const warningMsg = `  - ${warning.message}${warning.file ? ` (${warning.file})` : ''}`;
          messages.push({ type: 'warning', text: warningMsg });
          onValidation?.('warning', warningMsg);
          totalWarnings++;
        }
      }
    }

    const summary: ValidationSummary = {
      total: recipeDirectories.length,
      valid: validCount,
      totalErrors,
      totalWarnings,
    };

    return {
      messages,
      summary,
      context: {
        ...context,
        recipesValidated: validatedRecipeIds,
      },
    };
  } catch (error) {
    throw new RecipesError(
      extractErrorMessage(error),
      'LIBRARY_VALIDATION_FAILED'
    );
  }
}

async function validateGitRepository(
  gitUrl: string,
  options: Record<string, unknown>,
  context: Omit<ValidationContext, 'recipesValidated'>,
  onProgress?: ProgressCallback,
  onValidation?: ValidationCallback
): Promise<ValidationResult> {
  onProgress?.(`This will clone and validate recipes from: ${gitUrl}`);
  onProgress?.(
    'This will create a temporary directory and may take some time.'
  );

  const repoName = normalizeRepoIdentifier(gitUrl).replace(/[/\\]/g, '-');
  const tempDir = path.join(
    os.tmpdir(),
    `chorenzo-recipes-${repoName}-${Date.now()}`
  );

  try {
    onProgress?.('Cloning repository');
    await cloneRepository(gitUrl, tempDir, 'main');

    onProgress?.('Validating cloned recipes');
    const result = await validateLibrary(
      tempDir,
      options,
      context,
      onProgress,
      onValidation
    );

    return result;
  } catch (error) {
    if (error instanceof RecipesError) {
      throw error;
    }
    throw new RecipesError(
      formatErrorMessage('Failed to validate git repository', error),
      'GIT_VALIDATION_FAILED'
    );
  } finally {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      onProgress?.('Warning: Failed to clean up temporary directory');
    }
  }
}

function validateAndNormalizeName(
  name: string,
  type: 'recipe' | 'category'
): string {
  const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
  const errorCode =
    type === 'recipe' ? 'INVALID_RECIPE_NAME' : 'INVALID_CATEGORY_NAME';

  if (!name || name.trim().length === 0) {
    throw new RecipesError(
      `${capitalizedType} name cannot be empty`,
      errorCode
    );
  }

  const trimmed = name.trim();
  const normalized = trimmed.replace(/\s+/g, '-').toLowerCase();
  const invalidChars = normalized.match(/[^a-zA-Z0-9-]/g);

  if (invalidChars) {
    const uniqueInvalidChars = [...new Set(invalidChars)].join(', ');
    throw new RecipesError(
      `${capitalizedType} name contains invalid characters: ${uniqueInvalidChars}. Only letters, numbers, and dashes are allowed.`,
      errorCode
    );
  }

  return normalized;
}

export function validateRecipeId(recipeName: string): string {
  return validateAndNormalizeName(recipeName, 'recipe');
}

export function validateCategoryName(categoryName: string): string {
  return validateAndNormalizeName(categoryName, 'category');
}
