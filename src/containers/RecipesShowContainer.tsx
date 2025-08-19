import { Box, Text, useApp } from 'ink';
import React, { useEffect, useState } from 'react';

import { loadRecipeForShow } from '~/commands/recipes';
import { RecipeActionsMenu } from '~/components/RecipeActionsMenu';
import { RecipeDisplayComponent } from '~/components/RecipeDisplayComponent';
import { colors } from '~/styles/colors';
import { Recipe } from '~/types/recipe';
import {
  RecipeLocationInfo,
  RecipeShowContainerOptions,
} from '~/types/recipes-show';
import { extractErrorMessage } from '~/utils/error.utils';

interface RecipesShowContainerProps {
  options: RecipeShowContainerOptions;
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
  const [showApplyMessage, setShowApplyMessage] = useState(false);

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
        onError(
          error instanceof Error ? error : new Error(extractErrorMessage(error))
        );
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
    setShowApplyMessage(true);

    setTimeout(() => {
      exit();
    }, 3000);
  };

  const handleExit = async () => {
    setShowMenu(false);
    exit();
  };

  if (loading) {
    return <Text>Loading recipe information...</Text>;
  }

  if (!recipe || !location) {
    return <Text>Failed to load recipe information.</Text>;
  }

  if (showApplyMessage) {
    return (
      <Box flexDirection="column">
        <Text color={colors.info}>To apply this recipe, run:</Text>
        <Box marginTop={1} marginBottom={1}>
          <Text
            color={colors.success}
          >{`chorenzo recipes apply ${options.recipeName}`}</Text>
        </Box>
      </Box>
    );
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
