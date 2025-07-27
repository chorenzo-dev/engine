import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import {
  performRecipesGenerate,
  validateCategoryName,
  type GenerateOptions,
  type GenerateResult,
  type ProgressCallback,
} from '../commands/recipes';
import { libraryManager } from '../utils/library-manager.utils';
import { resolvePath } from '../utils/path.utils';
import {
  CodeChangesProgress,
  useCodeChangesProgress,
} from './CodeChangesProgress';
import { generateOperationId } from '../utils/code-changes-events.utils';

interface RecipeGenerateProgressProps {
  options: GenerateOptions;
  onComplete: (result: GenerateResult) => void;
  onError: (error: Error, collectedOptions?: GenerateOptions) => void;
}

export const RecipeGenerateProgress: React.FC<RecipeGenerateProgressProps> = ({
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
    | 'generating'
    | 'complete'
  >(getNextPhase);
  const [userInput, setUserInput] = useState<string>('');
  const [recipeName, setRecipeName] = useState<string>(options.name || '');
  const [useMagic, setUseMagic] = useState<boolean>(false);
  const [category, setCategory] = useState<string>('');
  const [categoryInput, setCategoryInput] = useState<string>('');
  const [showCustomCategory, setShowCustomCategory] = useState<boolean>(false);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [summaryInput, setSummaryInput] = useState<string>('');
  const [customLocationInput, setCustomLocationInput] = useState<string>('');
  const [showCustomLocation, setShowCustomLocation] = useState<boolean>(false);
  const { isRawModeSupported } = useStdin();

  const shouldUseInput = options.progress !== false && isRawModeSupported;

  const locationOptions = [
    { label: 'This workspace', value: 'workspace' },
    { label: 'This machine (~/.chorenzo/recipes/local)', value: 'machine' },
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
        selectedLocation = '~/.chorenzo/recipes/local';
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

          if (analysis.type === 'category_folder') {
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
          const collectedData: GenerateOptions = {
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

  useInput(
    (input, key) => {
      if (phase === 'name') {
        if (key.return) {
          const name = userInput.trim();
          if (name) {
            setRecipeName(name);
            const updatedOptions = { ...collectedOptions, name };
            setCollectedOptions(updatedOptions);
            setUserInput('');
            setPhase(getNextPhase(updatedOptions));
          }
        } else if (key.backspace || key.delete) {
          setUserInput((prev) => prev.slice(0, -1));
        } else if (input) {
          setUserInput((prev) => prev + input);
        }
      } else if (phase === 'summary') {
        if (key.return) {
          const summary = summaryInput.trim();
          if (summary) {
            setSummary(summary);
            const updatedOptions = { ...collectedOptions, summary };
            setCollectedOptions(updatedOptions);
            setSummaryInput('');
            setPhase(getNextPhase(updatedOptions));
          }
        } else if (key.backspace || key.delete) {
          setSummaryInput((prev) => prev.slice(0, -1));
        } else if (input) {
          setSummaryInput((prev) => prev + input);
        }
      } else if (phase === 'choice') {
        if (key.return) {
          const response = userInput.toLowerCase();
          if (response === 'y' || response === 'yes') {
            setUseMagic(true);
          } else {
            setUseMagic(false);
          }
          setUserInput('');
          setPhase('generating');
        } else if (key.backspace || key.delete) {
          setUserInput((prev) => prev.slice(0, -1));
        } else if (input) {
          setUserInput((prev) => prev + input);
        }
      }
    },
    { isActive: shouldUseInput }
  );

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

          const collectedData: GenerateOptions = {
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
        <Text color="blue">🎯 Recipe name: {userInput}</Text>
        <Text color="gray">Enter a name for your recipe and press Enter</Text>
      </Box>
    );
  }

  if (phase === 'location' && shouldUseInput) {
    if (showCustomLocation) {
      return (
        <Box flexDirection="column">
          <Text color="blue">📁 Enter custom location:</Text>
          <Box marginTop={1}>
            <Text>Location: </Text>
            <TextInput
              value={customLocationInput}
              onChange={setCustomLocationInput}
              onSubmit={handleCustomLocationSubmit}
            />
          </Box>
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        <Text color="blue">📁 Choose where to save the recipe:</Text>
        <SelectInput items={locationOptions} onSelect={handleLocationSelect} />
      </Box>
    );
  }

  if (phase === 'choice' && shouldUseInput) {
    return (
      <Box flexDirection="column">
        <Text color="blue">
          🛈 Do you want me to generate the recipe automatically using AI? (y/N){' '}
          {userInput}
        </Text>
      </Box>
    );
  }

  if (phase === 'category' && shouldUseInput) {
    if (showCustomCategory) {
      return (
        <Box flexDirection="column">
          <Text color="blue">📂 Enter custom category:</Text>
          <Box marginTop={1}>
            <Text>Category: </Text>
            <TextInput
              value={categoryInput}
              onChange={setCategoryInput}
              onSubmit={handleCustomCategorySubmit}
            />
          </Box>
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        <Text color="blue">📂 Choose a category for your recipe:</Text>
        <SelectInput items={categoryOptions} onSelect={handleCategorySelect} />
      </Box>
    );
  }

  if (phase === 'summary' && shouldUseInput) {
    return (
      <Box flexDirection="column">
        <Text color="blue">📝 Recipe summary: {summaryInput}</Text>
        <Text color="gray">
          Enter a one-sentence summary of what this recipe does and press Enter
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
