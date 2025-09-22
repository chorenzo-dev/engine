import * as fs from 'fs';
import * as path from 'path';

import { Recipe } from '~/types/recipe';
import { RecipesApplyError } from '~/types/recipes-apply';
import { libraryManager } from '~/utils/library-manager.utils';
import { Logger } from '~/utils/logger.utils';
import { resolvePath } from '~/utils/path.utils';
import { parseRecipeFromDirectory } from '~/utils/recipe.utils';

export type ProgressCallback = (
  step: string | null,
  isThinking?: boolean
) => void;

export enum InputType {
  RecipeName = 'recipe-name',
  RecipeFolder = 'recipe-folder',
  Library = 'library',
  GitUrl = 'git-url',
}

export function detectInputType(target: string): InputType {
  if (
    target.startsWith('http://') ||
    target.startsWith('https://') ||
    target.includes('.git')
  ) {
    return InputType.GitUrl;
  }

  if (
    target.startsWith('./') ||
    target.startsWith('../') ||
    target.startsWith('/') ||
    target.startsWith('~/')
  ) {
    const resolvedTarget = resolvePath(target);
    if (fs.existsSync(resolvedTarget)) {
      const stat = fs.statSync(resolvedTarget);
      if (stat.isDirectory()) {
        const metadataPath = path.join(resolvedTarget, 'metadata.yaml');
        if (fs.existsSync(metadataPath)) {
          return InputType.RecipeFolder;
        }
        return InputType.Library;
      }
    }
  }

  return InputType.RecipeName;
}

export async function loadRecipe(recipeName: string): Promise<Recipe> {
  const inputType = detectInputType(recipeName);
  const resolvedTarget =
    inputType === InputType.RecipeName || inputType === InputType.GitUrl
      ? recipeName
      : resolvePath(recipeName);

  switch (inputType) {
    case InputType.RecipeName: {
      let foundPaths = await libraryManager.findRecipeByName(resolvedTarget);

      if (foundPaths.length === 0) {
        Logger.info(
          { recipe: recipeName },
          'Recipe not found locally, refreshing all libraries'
        );
        await libraryManager.refreshAllLibraries();

        foundPaths = await libraryManager.findRecipeByName(resolvedTarget);
        if (foundPaths.length === 0) {
          throw new RecipesApplyError(
            `Recipe '${recipeName}' not found in recipe libraries even after refreshing`,
            'RECIPE_NOT_FOUND'
          );
        }
      }

      if (foundPaths.length > 1) {
        const pathsList = foundPaths.map((p) => `  - ${p}`).join('\n');
        throw new RecipesApplyError(
          `Multiple recipes named '${recipeName}' found:\n${pathsList}\nPlease specify the full path.`,
          'MULTIPLE_RECIPES_FOUND'
        );
      }

      const recipePath = foundPaths[0];
      if (!recipePath) {
        throw new RecipesApplyError(
          `Recipe path not found for '${recipeName}'`,
          'RECIPE_PATH_NOT_FOUND'
        );
      }
      const libraryName = libraryManager.isRemoteLibrary(recipePath);
      if (libraryName) {
        Logger.info(
          { recipe: recipeName, library: libraryName },
          'Recipe is from remote library, refreshing'
        );
        let lastError: Error | undefined;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await libraryManager.refreshLibrary(libraryName);
            break;
          } catch (error) {
            lastError =
              error instanceof Error ? error : new Error(String(error));
            const errorMessage = lastError.message;

            if (errorMessage.includes('REPOSITORY_LOCKED') && attempt < 3) {
              Logger.info(
                { library: libraryName, attempt, error: errorMessage },
                `Git repository locked, retrying in ${attempt * 500}ms...`
              );
              await new Promise((resolve) =>
                setTimeout(resolve, attempt * 500)
              );
            } else if (attempt === 3) {
              throw lastError;
            } else {
              throw lastError;
            }
          }
        }
      }

      return parseRecipeFromDirectory(recipePath);
    }

    case InputType.RecipeFolder: {
      if (!fs.existsSync(resolvedTarget)) {
        throw new RecipesApplyError(
          `Recipe folder does not exist: ${resolvedTarget}`,
          'RECIPE_NOT_FOUND'
        );
      }

      const libraryName = libraryManager.isRemoteLibrary(resolvedTarget);
      if (libraryName) {
        Logger.info(
          { recipe: recipeName, library: libraryName },
          'Recipe is from remote library, refreshing'
        );
        let lastError: Error | undefined;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await libraryManager.refreshLibrary(libraryName);
            break;
          } catch (error) {
            lastError =
              error instanceof Error ? error : new Error(String(error));
            const errorMessage = lastError.message;

            if (errorMessage.includes('REPOSITORY_LOCKED') && attempt < 3) {
              Logger.info(
                { library: libraryName, attempt, error: errorMessage },
                `Git repository locked, retrying in ${attempt * 500}ms...`
              );
              await new Promise((resolve) =>
                setTimeout(resolve, attempt * 500)
              );
            } else if (attempt === 3) {
              throw lastError;
            } else {
              throw lastError;
            }
          }
        }
      }

      return parseRecipeFromDirectory(resolvedTarget);
    }

    default:
      throw new RecipesApplyError(
        `Invalid recipe target: ${recipeName}`,
        'INVALID_RECIPE_TARGET'
      );
  }
}

export interface RecipesGenerateOptions {
  name?: string;
  cost?: boolean;
  magicGenerate?: boolean;
  category?: string;
  summary?: string;
  location?: string;
  saveLocation?: string;
  additionalInstructions?: string;
  ecosystemAgnostic?: boolean;
}

export interface RecipesGenerateResult {
  recipePath: string;
  recipeName: string;
  success: boolean;
  error?: string;
  metadata?: {
    costUsd: number;
    durationSeconds: number;
  };
}

export class RecipesError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'RecipesError';
  }
}
