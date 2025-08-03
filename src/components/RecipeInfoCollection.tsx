import { Box, Text, useStdin } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import path from 'path';
import React, { useCallback, useEffect, useState } from 'react';

import { validateCategoryName } from '~/commands/recipes';
import { colors } from '~/styles/colors';
import { RecipesGenerateOptions } from '~/types/recipes-generate';
import { chorenzoConfig } from '~/utils/config.utils';
import { libraryManager } from '~/utils/library-manager.utils';
import { resolvePath } from '~/utils/path.utils';

interface RecipeInfoCollectionProps {
  initialOptions: RecipesGenerateOptions;
  onComplete: (options: RecipesGenerateOptions) => void;
  onError: (error: Error) => void;
}

export const RecipeInfoCollection: React.FC<RecipeInfoCollectionProps> = ({
  initialOptions,
  onComplete,
  onError,
}) => {
  const { isRawModeSupported } = useStdin();
  const shouldUseInput =
    initialOptions.progress !== false && isRawModeSupported;

  const [formState, setFormState] = useState({
    name: initialOptions.name || '',
    saveLocation: initialOptions.saveLocation || '',
    category: initialOptions.category || '',
    summary: initialOptions.summary || '',
    customLocation: '',
    customCategory: '',
    instructions: '',
    useMagic: false,
    ecosystemAgnostic: initialOptions.ecosystemAgnostic ?? false,
    availableCategories: [] as string[],
    showCustomCategory: false,
    showCustomLocation: false,
  });

  const getNextPhase = useCallback((state: typeof formState) => {
    if (!state.name) {
      return 'name';
    }
    if (!state.saveLocation) {
      return 'location';
    }
    if (!state.category) {
      return 'category';
    }
    if (!state.summary) {
      return 'summary';
    }
    if (
      state.ecosystemAgnostic === undefined ||
      state.ecosystemAgnostic === null
    ) {
      return 'ecosystem-type';
    }
    return 'generation-method';
  }, []);

  const [phase, setPhase] = useState<
    | 'name'
    | 'location'
    | 'category'
    | 'summary'
    | 'ecosystem-type'
    | 'generation-method'
    | 'instructions'
    | 'complete'
  >(() => getNextPhase(formState));

  useEffect(() => {
    if (!shouldUseInput) {
      const missingFields = [];
      if (!formState.name) {
        missingFields.push('name');
      }
      if (!formState.category) {
        missingFields.push('category');
      }
      if (!formState.summary) {
        missingFields.push('summary');
      }

      if (missingFields.length > 0) {
        onError(
          new Error(
            `Missing required fields in non-interactive mode: ${missingFields.join(', ')}`
          )
        );
        return;
      }

      setPhase('generation-method');
    }
  }, [shouldUseInput]);

  useEffect(() => {
    if (phase === 'category') {
      const loadCategories = () => {
        try {
          const location = resolvePath(formState.saveLocation || process.cwd());
          const categories =
            libraryManager.getCategoriesForGeneration(location);

          if (
            categories.length === 1 &&
            path.basename(location) === categories[0]
          ) {
            const updatedState = { ...formState, category: categories[0] };
            setFormState(updatedState);
            setPhase(getNextPhase(updatedState));
            return;
          }

          setFormState((prev) => ({
            ...prev,
            availableCategories: categories,
          }));
        } catch (error) {
          onError(error instanceof Error ? error : new Error(String(error)));
        }
      };
      loadCategories();
    }
  }, [phase]);

  const locationOptions = [
    { label: `Current folder (${process.cwd()})`, value: 'workspace' },
    {
      label: `This machine (${chorenzoConfig.localRecipesDir})`,
      value: 'machine',
    },
    { label: 'Choose location', value: 'custom' },
  ];

  const categoryOptions = [
    ...formState.availableCategories.map((cat) => ({ label: cat, value: cat })),
    { label: 'Enter custom category', value: 'custom' },
  ];

  const handleLocationSelect = (item: { label: string; value: string }) => {
    if (item.value === 'custom') {
      setFormState((prev) => ({ ...prev, showCustomLocation: true }));
    } else {
      let selectedLocation = '';
      if (item.value === 'workspace') {
        selectedLocation = process.cwd();
      } else if (item.value === 'machine') {
        selectedLocation = chorenzoConfig.localRecipesDir;
      }
      const updatedState = { ...formState, saveLocation: selectedLocation };
      setFormState(updatedState);
      setPhase(getNextPhase(updatedState));
    }
  };

  const handleCustomLocationSubmit = () => {
    const location = resolvePath(formState.customLocation);
    const updatedState = { ...formState, saveLocation: location };
    setFormState(updatedState);
    setPhase(getNextPhase(updatedState));
  };

  const handleCategorySelect = (item: { label: string; value: string }) => {
    if (item.value === 'custom') {
      setFormState((prev) => ({ ...prev, showCustomCategory: true }));
    } else {
      const updatedState = { ...formState, category: item.value };
      setFormState(updatedState);
      setPhase(getNextPhase(updatedState));
    }
  };

  const handleCustomCategorySubmit = () => {
    try {
      const validatedCategory = validateCategoryName(formState.customCategory);
      const updatedState = { ...formState, category: validatedCategory };
      setFormState(updatedState);
      setPhase(getNextPhase(updatedState));
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  };

  const handleComplete = () => {
    const finalOptions: RecipesGenerateOptions = {
      ...initialOptions,
      name: formState.name,
      saveLocation: formState.saveLocation,
      category: formState.category,
      summary: formState.summary,
      magicGenerate: formState.useMagic,
      ecosystemAgnostic: formState.ecosystemAgnostic,
      additionalInstructions: formState.useMagic
        ? formState.instructions
        : undefined,
    };
    onComplete(finalOptions);
  };

  if (phase === 'name' && shouldUseInput) {
    return (
      <Box flexDirection="column">
        <Box>
          <Text>Recipe name: </Text>
          <TextInput
            value={formState.name}
            onChange={(value) =>
              setFormState((prev) => ({ ...prev, name: value }))
            }
            onSubmit={() => {
              if (formState.name.trim()) {
                setPhase(getNextPhase(formState));
              }
            }}
          />
        </Box>
      </Box>
    );
  }

  if (phase === 'location' && shouldUseInput) {
    if (formState.showCustomLocation) {
      return (
        <Box>
          <Text>Enter location: </Text>
          <TextInput
            value={formState.customLocation}
            onChange={(value) =>
              setFormState((prev) => ({ ...prev, customLocation: value }))
            }
            onSubmit={handleCustomLocationSubmit}
          />
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        <Text>Choose where to save the recipe:</Text>
        <SelectInput items={locationOptions} onSelect={handleLocationSelect} />
      </Box>
    );
  }

  if (phase === 'category' && shouldUseInput) {
    if (formState.showCustomCategory) {
      return (
        <Box flexDirection="column">
          <Box>
            <Text>Category name: </Text>
            <TextInput
              value={formState.customCategory}
              onChange={(value) =>
                setFormState((prev) => ({ ...prev, customCategory: value }))
              }
              onSubmit={handleCustomCategorySubmit}
            />
          </Box>
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        <Text>Choose a category for your recipe:</Text>
        <SelectInput items={categoryOptions} onSelect={handleCategorySelect} />
      </Box>
    );
  }

  if (phase === 'summary' && shouldUseInput) {
    return (
      <Box flexDirection="column">
        <Box>
          <Text>Recipe summary: </Text>
          <TextInput
            value={formState.summary}
            onChange={(value) =>
              setFormState((prev) => ({ ...prev, summary: value }))
            }
            onSubmit={() => {
              if (formState.summary.trim()) {
                setPhase(getNextPhase(formState));
              }
            }}
          />
        </Box>
        <Text color={colors.muted} dimColor>
          Enter a brief summary of what this recipe does
        </Text>
      </Box>
    );
  }

  if (phase === 'ecosystem-type' && shouldUseInput) {
    const ecosystemOptions = [
      {
        label: 'Ecosystem-specific (works with specific languages/frameworks)',
        value: false,
      },
      {
        label: 'Ecosystem-agnostic (works across all languages/ecosystems)',
        value: true,
      },
    ];

    const handleEcosystemSelect = (item: { value: boolean }) => {
      setFormState((prev) => ({ ...prev, ecosystemAgnostic: item.value }));
      setPhase(getNextPhase({ ...formState, ecosystemAgnostic: item.value }));
    };

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Recipe Type</Text>
        </Box>
        <Text color={colors.muted} dimColor>
          Choose whether this recipe works with specific ecosystems or all
          ecosystems
        </Text>
        <Box marginTop={1}>
          <SelectInput
            items={ecosystemOptions}
            onSelect={handleEcosystemSelect}
          />
        </Box>
      </Box>
    );
  }

  if (phase === 'generation-method') {
    if (!shouldUseInput) {
      handleComplete();
      return null;
    }

    const choiceOptions = [
      { label: 'Use basic template', value: 'basic' },
      { label: 'Generate with AI (uses Claude)', value: 'magic' },
    ];

    return (
      <Box flexDirection="column">
        <Text>Choose generation method:</Text>
        <SelectInput
          items={choiceOptions}
          onSelect={(item) => {
            const useMagicGeneration = item.value === 'magic';
            setFormState((prev) => ({ ...prev, useMagic: useMagicGeneration }));
            if (useMagicGeneration) {
              setPhase('instructions');
            } else {
              handleComplete();
            }
          }}
        />
      </Box>
    );
  }

  if (phase === 'instructions' && shouldUseInput) {
    return (
      <Box flexDirection="column">
        <Text>
          Any specific requirements? (press Enter to skip or continue):
        </Text>
        <TextInput
          value={formState.instructions}
          onChange={(value) =>
            setFormState((prev) => ({ ...prev, instructions: value }))
          }
          onSubmit={() => {
            handleComplete();
          }}
        />
      </Box>
    );
  }

  return null;
};
