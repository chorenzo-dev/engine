import * as path from 'path';

import { Recipe } from '~/types/recipe';
import { chorenzoConfig } from '~/utils/config.utils';
import { libraryManager } from '~/utils/library-manager.utils';

import { loadRecipe } from './recipes.shared';

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
