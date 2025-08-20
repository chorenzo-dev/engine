import { Recipe } from '~/types/recipe';
import { libraryManager } from '~/utils/library-manager.utils';

import { RecipesError } from './recipes.shared';

export async function getRecipeCategories(): Promise<string[]> {
  try {
    return await libraryManager.getAllCategories();
  } catch (error) {
    throw new RecipesError(
      `Failed to get recipe categories: ${error instanceof Error ? error.message : String(error)}`,
      'CATEGORIES_FAILED'
    );
  }
}

export async function getRecipesByCategory(
  category: string
): Promise<Recipe[]> {
  try {
    return await libraryManager.getRecipesByCategory(category);
  } catch (error) {
    throw new RecipesError(
      `Failed to get recipes for category '${category}': ${error instanceof Error ? error.message : String(error)}`,
      'RECIPES_BY_CATEGORY_FAILED'
    );
  }
}
