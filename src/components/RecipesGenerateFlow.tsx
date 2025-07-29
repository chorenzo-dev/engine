import { Box, Text, useStdin } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import React, { useCallback, useEffect, useState } from 'react';

import {
  type ProgressCallback,
  performRecipesGenerate,
  validateCategoryName,
} from '~/commands/recipes';
import { colors } from '~/styles/colors';
import {
  RecipesGenerateOptions,
  RecipesGenerateResult,
} from '~/types/recipes-generate';
import { chorenzoConfig } from '~/utils/chorenzo-config.utils';
import { generateOperationId } from '~/utils/code-changes-events.utils';
import { LocationType, libraryManager } from '~/utils/library-manager.utils';
import { resolvePath } from '~/utils/path.utils';

import {
  CodeChangesProgress,
  useCodeChangesProgress,
} from './CodeChangesProgress';

interface RecipesGenerateFlowProps {
  options: RecipesGenerateOptions;
  onComplete: (result: RecipesGenerateResult) => void;
  onError: (error: Error, collectedOptions?: RecipesGenerateOptions) => void;
}

export const RecipesGenerateFlow: React.FC<RecipesGenerateFlowProps> = ({
  options,
  onComplete,
  onError,
}) => {
  const {
    operations,
    startOperation,
    progressOperation,
    completeOperation,
    errorOperation,
    updateOperation,
  } = useCodeChangesProgress();

  const [collectedOptions, setCollectedOptions] = useState({
    name: options.name || '',
    saveLocation: options.saveLocation || '',
    category: options.category || '',
    summary: options.summary || '',
  });

  const getNextPhase = useCallback(
    (options: typeof collectedOptions = collectedOptions) => {
      if (!options.name) {
        return 'name';
      }
      if (!options.saveLocation) {
        return 'location';
      }
      if (!options.category) {
        return 'category';
      }
      if (!options.summary) {
        return 'summary';
      }
      return 'choice';
    },
    []
  );

  const [phase, setPhase] = useState<
    | 'name'
    | 'location'
    | 'category'
    | 'summary'
    | 'choice'
    | 'instructions'
    | 'generating'
    | 'complete'
  >(getNextPhase);
  const [userInput, setUserInput] = useState<string>('');
  const [recipeName, setRecipeName] = useState<string>(options.name || '');
  const [useMagic, setUseMagic] = useState<boolean>(false);
  const [category, setCategory] = useState<string>(options.category || '');
  const [categoryInput, setCategoryInput] = useState<string>('');
  const [showCustomCategory, setShowCustomCategory] = useState<boolean>(false);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [summary, setSummary] = useState<string>(options.summary || '');
  const [summaryInput, setSummaryInput] = useState<string>('');
  const [customLocationInput, setCustomLocationInput] = useState<string>('');
  const [showCustomLocation, setShowCustomLocation] = useState<boolean>(false);
  const [additionalInstructions, setAdditionalInstructions] =
    useState<string>('');
  const [instructionsInput, setInstructionsInput] = useState<string>('');
  const { isRawModeSupported } = useStdin();

  const shouldUseInput = options.progress !== false && isRawModeSupported;

  const locationOptions = [
    { label: `Current folder (${process.cwd()})`, value: 'workspace' },
    {
      label: `This machine (${chorenzoConfig.localRecipesDir})`,
      value: 'machine',
    },
    { label: 'Choose location', value: 'custom' },
  ];

  const categoryOptions = [
    ...availableCategories.map((cat) => ({ label: cat, value: cat })),
    { label: 'Enter custom category', value: 'custom' },
  ];

  const handleLocationSelect = (item: { label: string; value: string }) => {
    if (item.value === 'custom') {
      setShowCustomLocation(true);
    } else {
      let selectedLocation = '';
      if (item.value === 'workspace') {
        selectedLocation = process.cwd();
      } else if (item.value === 'machine') {
        selectedLocation = chorenzoConfig.localRecipesDir;
      }
      const updatedOptions = {
        ...collectedOptions,
        saveLocation: selectedLocation,
      };
      setCollectedOptions(updatedOptions);
      setPhase(getNextPhase(updatedOptions));
    }
  };

  const handleCustomLocationSubmit = () => {
    if (customLocationInput.trim()) {
      const location = customLocationInput.trim();
      const updatedOptions = { ...collectedOptions, saveLocation: location };
      setCollectedOptions(updatedOptions);
      setPhase(getNextPhase(updatedOptions));
    }
  };

  const handleCategorySelect = (item: { label: string; value: string }) => {
    if (item.value === 'custom') {
      setShowCustomCategory(true);
    } else {
      setCategory(item.value);
      const updatedOptions = { ...collectedOptions, category: item.value };
      setCollectedOptions(updatedOptions);
      setPhase(getNextPhase(updatedOptions));
    }
  };

  const handleCustomCategorySubmit = () => {
    if (categoryInput.trim()) {
      try {
        const validatedCategory = validateCategoryName(categoryInput);
        setCategory(validatedCategory);
        const updatedOptions = {
          ...collectedOptions,
          category: validatedCategory,
        };
        setCollectedOptions(updatedOptions);
        setPhase(getNextPhase(updatedOptions));
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  };

  useEffect(() => {
    if (phase === 'name') {
      if (collectedOptions.name) {
        setRecipeName(collectedOptions.name);
        setPhase(getNextPhase(collectedOptions));
      } else if (!shouldUseInput) {
        onError(
          new Error(
            'Recipe name is required. Use: chorenzo recipes generate <name>'
          )
        );
      }
    } else if (phase === 'location' && !shouldUseInput) {
      onError(
        new Error(
          'Location selection requires interactive mode. Use --location to specify a location'
        )
      );
    } else if (phase === 'category' && !shouldUseInput) {
      onError(
        new Error(
          'Category selection requires interactive mode. Use --category to specify a category'
        )
      );
    } else if (phase === 'summary' && !shouldUseInput) {
      onError(
        new Error(
          'Summary selection requires interactive mode. Use --summary to specify a summary'
        )
      );
    } else if (phase === 'choice' && !shouldUseInput) {
      onError(new Error('Magic generation choice requires interactive mode'));
    }
  }, [phase, collectedOptions.name, shouldUseInput]);

  useEffect(() => {
    if (phase === 'category') {
      const loadCategories = async () => {
        try {
          const location = resolvePath(
            collectedOptions.saveLocation || process.cwd()
          );
          const analysis = libraryManager.analyzeLocation(location);

          if (analysis.type === LocationType.CategoryFolder) {
            setCategory(analysis.categoryName!);
            const updatedOptions = {
              ...collectedOptions,
              category: analysis.categoryName!,
            };
            setCollectedOptions(updatedOptions);
            setPhase(getNextPhase(updatedOptions));
            return;
          }

          const categories = await libraryManager.getAllCategories(location);
          setAvailableCategories(categories);
        } catch (error) {
          const collectedData: RecipesGenerateOptions = {
            name: collectedOptions.name,
            category: collectedOptions.category,
            summary: collectedOptions.summary,
            saveLocation: collectedOptions.saveLocation,
            magicGenerate: false,
          };
          onError(
            error instanceof Error ? error : new Error(String(error)),
            collectedData
          );
        }
      };
      loadCategories();
    }
  }, [phase]);

  useEffect(() => {
    if (phase === 'generating' && recipeName && category && summary) {
      const runGenerate = async () => {
        const operationId = generateOperationId('generate');

        try {
          startOperation({
            id: operationId,
            type: 'generate',
            description: `Generating recipe: ${recipeName}`,
            status: 'in_progress',
          });

          const progressCallback: ProgressCallback = (step, isThinking) => {
            if (step) {
              progressOperation(operationId, step);
            }
            if (isThinking !== undefined) {
              updateOperation(operationId, { isThinking });
            }
          };

          const result = await performRecipesGenerate(
            {
              ...options,
              name: recipeName,
              magicGenerate: useMagic,
              category,
              summary,
              saveLocation: collectedOptions.saveLocation,
              additionalInstructions,
            },
            progressCallback
          );

          completeOperation(operationId, {
            costUsd: result.metadata?.costUsd || 0,
            durationSeconds: result.metadata?.durationSeconds || 0,
          });

          setPhase('complete');
          onComplete(result);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          errorOperation(operationId, errorMessage);

          const collectedData: RecipesGenerateOptions = {
            name: recipeName,
            category,
            summary,
            saveLocation: collectedOptions.saveLocation,
            magicGenerate: useMagic,
          };

          onError(
            err instanceof Error ? err : new Error(errorMessage),
            collectedData
          );
        }
      };
      runGenerate();
    }
  }, [
    phase,
    recipeName,
    useMagic,
    category,
    summary,
    options,
    collectedOptions.saveLocation,
    onComplete,
    onError,
    startOperation,
    progressOperation,
    completeOperation,
    errorOperation,
    updateOperation,
  ]);

  if (phase === 'name' && shouldUseInput) {
    return (
      <Box flexDirection="column">
        <Box>
          <Text>Recipe name: </Text>
          <TextInput
            value={userInput}
            onChange={setUserInput}
            onSubmit={() => {
              const name = userInput.trim();
              if (name) {
                setRecipeName(name);
                const updatedOptions = { ...collectedOptions, name };
                setCollectedOptions(updatedOptions);
                setUserInput('');
                setPhase(getNextPhase(updatedOptions));
              }
            }}
            showCursor
          />
        </Box>
      </Box>
    );
  }

  if (phase === 'location' && shouldUseInput) {
    if (showCustomLocation) {
      return (
        <Box flexDirection="column">
          <Box>
            <Text>Custom location: </Text>
            <TextInput
              value={customLocationInput}
              onChange={setCustomLocationInput}
              onSubmit={handleCustomLocationSubmit}
              showCursor
            />
          </Box>
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

  if (phase === 'choice' && shouldUseInput) {
    return (
      <Box flexDirection="column">
        <Box>
          <Text>
            Do you want me to generate the recipe automatically using AI?
            (y/N){' '}
          </Text>
          <TextInput
            value={userInput}
            onChange={setUserInput}
            onSubmit={() => {
              const response = userInput.toLowerCase();
              if (response === 'y' || response === 'yes') {
                setUseMagic(true);
                setUserInput('');
                setPhase('instructions');
              } else {
                setUseMagic(false);
                setUserInput('');
                setPhase('generating');
              }
            }}
            showCursor
          />
        </Box>
      </Box>
    );
  }

  if (phase === 'category' && shouldUseInput) {
    if (showCustomCategory) {
      return (
        <Box flexDirection="column">
          <Box>
            <Text>Custom category: </Text>
            <TextInput
              value={categoryInput}
              onChange={setCategoryInput}
              onSubmit={handleCustomCategorySubmit}
              showCursor
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
            value={summaryInput}
            onChange={setSummaryInput}
            onSubmit={() => {
              const summary = summaryInput.trim();
              if (summary) {
                setSummary(summary);
                const updatedOptions = { ...collectedOptions, summary };
                setCollectedOptions(updatedOptions);
                setSummaryInput('');
                setPhase(getNextPhase(updatedOptions));
              }
            }}
            showCursor
          />
        </Box>
        <Text color={colors.muted} dimColor>
          Enter a one-sentence summary of what this recipe does
        </Text>
      </Box>
    );
  }

  if (phase === 'instructions' && shouldUseInput) {
    return (
      <Box flexDirection="column">
        <Box>
          <Text>Additional instructions (optional):</Text>
          <TextInput
            value={instructionsInput}
            onChange={setInstructionsInput}
            onSubmit={() => {
              const instructions = instructionsInput.trim();
              setAdditionalInstructions(instructions);
              setInstructionsInput('');
              setPhase('generating');
            }}
            showCursor
          />
        </Box>
        <Text color={colors.muted} dimColor>
          Press Enter to continue without additional instructions
        </Text>
      </Box>
    );
  }

  if (phase === 'generating') {
    return (
      <Box flexDirection="column">
        <CodeChangesProgress operations={operations} />
      </Box>
    );
  }

  return null;
};
