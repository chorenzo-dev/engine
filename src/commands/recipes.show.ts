import * as fs from 'fs';
import * as path from 'path';

import { Recipe } from '~/types/recipe';
import { RecipesApplyError } from '~/types/recipes-apply';
import { chorenzoConfig } from '~/utils/config.utils';
import { libraryManager } from '~/utils/library-manager.utils';
import { Logger } from '~/utils/logger.utils';
import { resolvePath } from '~/utils/path.utils';
import { parseRecipeFromDirectory } from '~/utils/recipe.utils';

import { InputType, detectInputType } from './recipes.shared';

async function findRecipeByName(recipeName: string): Promise<string[]> {
  return await libraryManager.findRecipeByName(recipeName);
}

async function loadRecipe(recipeName: string): Promise<Recipe> {
  const inputType = detectInputType(recipeName);
  const resolvedTarget =
    inputType === InputType.RecipeName || inputType === InputType.GitUrl
      ? recipeName
      : resolvePath(recipeName);

  switch (inputType) {
    case InputType.RecipeName: {
      let foundPaths = await findRecipeByName(resolvedTarget);

      if (foundPaths.length === 0) {
        Logger.info(
          { recipe: recipeName },
          'Recipe not found locally, refreshing all libraries'
        );
        await libraryManager.refreshAllLibraries();

        foundPaths = await findRecipeByName(resolvedTarget);
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
        await libraryManager.refreshLibrary(libraryName);
      }

      return await parseRecipeFromDirectory(recipePath);
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
        await libraryManager.refreshLibrary(libraryName);
      }

      return await parseRecipeFromDirectory(resolvedTarget);
    }

    default:
      throw new RecipesApplyError(
        `Invalid recipe target: ${recipeName}`,
        'INVALID_RECIPE_TARGET'
      );
  }
}

export async function loadRecipeForShow(recipeName: string): Promise<{
  recipe: Recipe;
  localPath: string;
  isRemote: boolean;
  webUrl?: string;
}> {
  const recipe = await loadRecipe(recipeName);

  const localPath = recipe.path;
  const libraryName = libraryManager.isRemoteLibrary(localPath);
  const isRemote = libraryName !== null;

  let webUrl: string | undefined;
  if (isRemote && libraryName) {
    const config = await chorenzoConfig.readConfig();
    const libraryConfig = config.libraries[libraryName];
    if (libraryConfig?.repo) {
      const repoUrl = libraryConfig.repo;
      if (repoUrl.includes('github.com')) {
        const repoPath = repoUrl
          .replace(/\.git$/, '')
          .replace('https://github.com/', '');
        const recipePath = path.relative(
          chorenzoConfig.getLibraryPath(libraryName),
          localPath
        );
        webUrl = `https://github.com/${repoPath}/tree/${libraryConfig.ref}/${recipePath}`;
      }
    }
  }

  return {
    recipe,
    localPath,
    isRemote,
    webUrl,
  };
}
