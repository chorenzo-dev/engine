import { Box, Text, useApp } from 'ink';
import SelectInput, {
  type IndicatorProps,
  type ItemProps,
} from 'ink-select-input';
import React, { useEffect, useState } from 'react';

import {
  getRecipeCategories,
  getRecipesByCategory,
  loadRecipeForShow,
} from '~/commands/recipes';
import { RecipeDisplayComponent } from '~/components/RecipeDisplayComponent';
import { colors } from '~/styles/colors';
import { Recipe } from '~/types/recipe';
import { RecipeLocationInfo } from '~/types/recipes-show';

interface RecipesListContainerProps {
  onError: (error: Error) => void;
}

type ViewMode = 'categories' | 'recipes' | 'details';

interface CategoryItem {
  key?: string;
  label: string;
  value: string;
}

interface RecipeItem {
  key?: string;
  label: string;
  value: Recipe | 'back';
}

export const RecipesListContainer: React.FC<RecipesListContainerProps> = ({
  onError,
}) => {
  const { exit } = useApp();
  const [viewMode, setViewMode] = useState<ViewMode>('categories');
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [recipeLocation, setRecipeLocation] =
    useState<RecipeLocationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [loadingRecipeDetails, setLoadingRecipeDetails] = useState(false);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const categoryList = await getRecipeCategories();
        setCategories(categoryList);
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
      } finally {
        setLoading(false);
      }
    };

    loadCategories();
  }, [onError]);

  const handleCategorySelect = async (item: CategoryItem) => {
    setSelectedCategory(item.value);
    setLoadingRecipes(true);

    try {
      const categoryRecipes = await getRecipesByCategory(item.value);
      setRecipes(categoryRecipes);
      setViewMode('recipes');
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setLoadingRecipes(false);
    }
  };

  const handleRecipeSelect = async (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setLoadingRecipeDetails(true);

    try {
      const result = await loadRecipeForShow(recipe.getId());
      setRecipeLocation({
        localPath: result.localPath,
        isRemote: result.isRemote,
        webUrl: result.webUrl,
      });
      setViewMode('details');
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setLoadingRecipeDetails(false);
    }
  };

  const handleBackFromRecipes = () => {
    setViewMode('categories');
    setSelectedCategory('');
    setRecipes([]);
  };

  const handleBackFromDetails = () => {
    setViewMode('recipes');
    setSelectedRecipe(null);
    setRecipeLocation(null);
  };

  const handleApply = () => {
    if (selectedRecipe) {
      exit();
      // The apply command will be shown to the user
    }
  };

  const handleExit = () => {
    exit();
  };

  if (loading) {
    return <Text>Loading categories...</Text>;
  }

  if (categories.length === 0) {
    return <Text>No recipe categories found.</Text>;
  }

  // Categories view
  if (viewMode === 'categories') {
    const categoryItems: CategoryItem[] = categories.map((category) => ({
      key: category,
      label: category,
      value: category,
    }));

    return (
      <Box flexDirection="column">
        <Text bold color={colors.info}>
          Choose a category:
        </Text>
        <SelectInput
          items={categoryItems}
          onSelect={handleCategorySelect}
          indicatorComponent={({ isSelected }: IndicatorProps) => (
            <Text color={isSelected ? colors.progress : colors.muted}>
              {isSelected ? '❯' : ' '}
            </Text>
          )}
          itemComponent={({ isSelected, label }: ItemProps) =>
            isSelected ? (
              <Text color={colors.progress}>{label}</Text>
            ) : (
              <Text>{label}</Text>
            )
          }
        />
      </Box>
    );
  }

  // Recipes view
  if (viewMode === 'recipes') {
    if (loadingRecipes) {
      return <Text>Loading recipes...</Text>;
    }

    if (recipes.length === 0) {
      return (
        <Box flexDirection="column">
          <Text>No recipes found in category: {selectedCategory}</Text>
          <Text color={colors.muted}>Press any key to go back...</Text>
        </Box>
      );
    }

    const recipeItems: RecipeItem[] = recipes.map((recipe) => ({
      key: recipe.getId(),
      label: recipe.getId(),
      value: recipe,
    }));

    const backItem: RecipeItem = {
      key: 'back',
      label: '← Back to categories',
      value: 'back',
    };
    const itemsWithBack: RecipeItem[] = [...recipeItems, backItem];

    return (
      <Box flexDirection="column">
        <Text bold color={colors.info}>
          Recipes in category: {selectedCategory}
        </Text>
        <SelectInput
          items={itemsWithBack}
          onSelect={(item) => {
            if (item.value === 'back') {
              handleBackFromRecipes();
            } else {
              handleRecipeSelect(item.value as Recipe);
            }
          }}
          indicatorComponent={({ isSelected }: IndicatorProps) => (
            <Text color={isSelected ? colors.progress : colors.muted}>
              {isSelected ? '❯' : ' '}
            </Text>
          )}
          itemComponent={({ isSelected, label }: ItemProps) =>
            isSelected ? (
              <Text color={colors.progress}>{label}</Text>
            ) : (
              <Text>{label}</Text>
            )
          }
        />
      </Box>
    );
  }

  // Recipe details view
  if (viewMode === 'details') {
    if (loadingRecipeDetails) {
      return <Text>Loading recipe details...</Text>;
    }

    if (!selectedRecipe || !recipeLocation) {
      return <Text>Failed to load recipe details.</Text>;
    }

    const detailActions = [
      { label: 'Apply Recipe', value: 'apply' },
      { label: '← Back to recipes', value: 'back' },
      { label: 'Exit', value: 'exit' },
    ];

    return (
      <Box flexDirection="column">
        <RecipeDisplayComponent
          recipe={selectedRecipe}
          location={recipeLocation}
        />
        <Box marginTop={1}>
          <Text>What would you like to do?</Text>
          <SelectInput
            items={detailActions}
            onSelect={(item) => {
              if (item.value === 'apply') {
                handleApply();
              } else if (item.value === 'back') {
                handleBackFromDetails();
              } else {
                handleExit();
              }
            }}
            indicatorComponent={({ isSelected }: IndicatorProps) => (
              <Text color={isSelected ? colors.progress : colors.muted}>
                {isSelected ? '❯' : ' '}
              </Text>
            )}
            itemComponent={({ isSelected, label }: ItemProps) =>
              isSelected ? (
                <Text color={colors.progress}>{label}</Text>
              ) : (
                <Text>{label}</Text>
              )
            }
          />
        </Box>
      </Box>
    );
  }

  return null;
};
