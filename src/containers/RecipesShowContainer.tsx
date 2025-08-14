import { Text } from 'ink';
import React, { useEffect, useState } from 'react';

import { loadRecipeForShow } from '~/commands/recipes';
import { RecipeDisplayComponent } from '~/components/RecipeDisplayComponent';
import { BaseContainerOptions } from '~/types/common';
import { Recipe } from '~/types/recipe';
import { RecipeLocationInfo } from '~/types/recipes-show';

interface RecipesShowContainerOptions extends BaseContainerOptions {
  recipeName: string;
}

interface RecipesShowContainerProps {
  options: RecipesShowContainerOptions;
  onError: (error: Error) => void;
}

export const RecipesShowContainer: React.FC<RecipesShowContainerProps> = ({
  options,
  onError,
}) => {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [location, setLocation] = useState<RecipeLocationInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRecipe = async () => {
      try {
        const result = await loadRecipeForShow(options.recipeName);
        setRecipe(result.recipe);
        setLocation({
          localPath: result.localPath,
          isRemote: result.isRemote,
          webUrl: result.webUrl,
        });
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
      } finally {
        setLoading(false);
      }
    };

    loadRecipe();
  }, [options.recipeName, onError]);

  if (loading) {
    return <Text>Loading recipe information...</Text>;
  }

  if (!recipe || !location) {
    return <Text>Failed to load recipe information.</Text>;
  }

  return <RecipeDisplayComponent recipe={recipe} location={location} />;
};
