import { Box, Text, useApp } from 'ink';
import React, { useEffect, useState } from 'react';

import { loadRecipeForShow } from '~/commands/recipes';
import { RecipeActionsMenu } from '~/components/RecipeActionsMenu';
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
  const { exit } = useApp();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [location, setLocation] = useState<RecipeLocationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);

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
        setShowMenu(true);
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
      } finally {
        setLoading(false);
      }
    };

    loadRecipe();
  }, [options.recipeName, onError]);

  const handleApply = async () => {
    if (!recipe) {
      return;
    }

    setShowMenu(false);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        exit(
          new Error(
            `To apply this recipe, run:\n\nchorenzo recipes apply ${options.recipeName}`
          )
        );
        resolve();
      }, 1500);
    });
  };

  const handleExit = async () => {
    setShowMenu(false);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        exit();
        resolve();
      }, 500);
    });
  };

  if (loading) {
    return <Text>Loading recipe information...</Text>;
  }

  if (!recipe || !location) {
    return <Text>Failed to load recipe information.</Text>;
  }

  return (
    <Box flexDirection="column">
      <RecipeDisplayComponent recipe={recipe} location={location} />
      {showMenu && (
        <Box marginTop={1}>
          <RecipeActionsMenu onApply={handleApply} onExit={handleExit} />
        </Box>
      )}
    </Box>
  );
};
