import { Box, Text, useApp } from 'ink';
import React, { useEffect, useState } from 'react';

import {
  readCurrentState,
  validateWorkspaceDependencies,
} from '~/commands/recipes.apply';
import { loadRecipeForShow } from '~/commands/recipes.show';
import { RecipeActionsMenu } from '~/components/RecipeActionsMenu';
import { RecipeDisplayComponent } from '~/components/RecipeDisplayComponent';
import { colors } from '~/styles/colors';
import { Recipe } from '~/types/recipe';
import { RecipesApplyDependencyValidationResult } from '~/types/recipes-apply';
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
  const [validationResult, setValidationResult] = useState<
    RecipesApplyDependencyValidationResult | undefined
  >(undefined);
  const [validationLoading, setValidationLoading] = useState(false);

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

        setValidationLoading(true);
        try {
          const currentState = readCurrentState();
          const validation = validateWorkspaceDependencies(
            result.recipe,
            currentState
          );
          setValidationResult(validation);
        } catch {
          setValidationResult({
            satisfied: false,
            missing: [],
            conflicting: [],
          });
        } finally {
          setValidationLoading(false);
        }

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

  const handleApply = () => {
    if (!recipe) {
      return;
    }

    setShowMenu(false);
    setShowApplyMessage(true);

    setTimeout(() => {
      exit();
    }, 3000);
  };

  const handleExit = () => {
    setShowMenu(false);
    exit();
  };

  if (loading) {
    return <Text>Loading recipe information...</Text>;
  }

  if (validationLoading) {
    return <Text>Validating recipe requirements...</Text>;
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
      <RecipeDisplayComponent
        recipe={recipe}
        location={location}
        validationResult={validationResult}
      />
      {showMenu && (
        <Box marginTop={1}>
          <RecipeActionsMenu
            onApply={handleApply}
            onExit={handleExit}
            validationResult={validationResult}
          />
        </Box>
      )}
    </Box>
  );
};
