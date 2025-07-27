import React, { useState, useEffect } from 'react';
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

interface RecipeGenerateProgressProps {
  options: GenerateOptions;
  onComplete: (result: GenerateResult) => void;
  onError: (error: Error) => void;
}

export const RecipeGenerateProgress: React.FC<RecipeGenerateProgressProps> = ({
  options,
  onComplete,
  onError,
}) => {
  const [phase, setPhase] = useState<
    'input' | 'choice' | 'category' | 'generating' | 'complete'
  >(() => {
    if (options.name) {
      return 'choice';
    }
    return 'input';
  });
  const [step, setStep] = useState<string>('');
  const [userInput, setUserInput] = useState<string>('');
  const [recipeName, setRecipeName] = useState<string>(options.name || '');
  const [useMagic, setUseMagic] = useState<boolean>(false);
  const [category, setCategory] = useState<string>('');
  const [categoryInput, setCategoryInput] = useState<string>('');
  const [showCustomCategory, setShowCustomCategory] = useState<boolean>(false);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const { isRawModeSupported } = useStdin();

  const shouldUseInput = options.progress !== false && isRawModeSupported;

  const categoryOptions = [
    ...availableCategories.map((cat) => ({ label: cat, value: cat })),
    { label: 'Enter custom category', value: 'custom' },
  ];

  const handleCategorySelect = (item: { label: string; value: string }) => {
    if (item.value === 'custom') {
      setShowCustomCategory(true);
    } else {
      setCategory(item.value);
      setPhase('generating');
    }
  };

  const handleCustomCategorySubmit = () => {
    if (categoryInput.trim()) {
      try {
        const validatedCategory = validateCategoryName(categoryInput);
        setCategory(validatedCategory);
        setPhase('generating');
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  };

  useEffect(() => {
    if (phase === 'input') {
      if (options.name) {
        setRecipeName(options.name);
        setPhase('choice');
      } else if (!shouldUseInput) {
        onError(
          new Error(
            'Recipe name is required. Use: chorenzo recipes generate <name>'
          )
        );
      }
    } else if (phase === 'choice' && !shouldUseInput) {
      onError(
        new Error(
          'Category selection requires interactive mode. Use --category to specify a category'
        )
      );
    }
  }, [phase, options.name, shouldUseInput, onError]);

  useEffect(() => {
    if (phase === 'category') {
      const loadCategories = async () => {
        try {
          const saveLocation = options.saveLocation || process.cwd();
          const analysis = libraryManager.analyzeLocation(saveLocation);

          if (analysis.type === 'category_folder') {
            setCategory(analysis.categoryName!);
            setPhase('generating');
            return;
          }

          const categories =
            await libraryManager.getAllCategories(saveLocation);
          setAvailableCategories(categories);
        } catch (error) {
          onError(error instanceof Error ? error : new Error(String(error)));
        }
      };
      loadCategories();
    }
  }, [phase, options.saveLocation, onError]);

  useInput(
    (input, key) => {
      if (phase === 'input') {
        if (key.return) {
          const name = userInput.trim();
          if (name) {
            setRecipeName(name);
            setUserInput('');
            setPhase('choice');
          }
        } else if (key.backspace || key.delete) {
          setUserInput((prev) => prev.slice(0, -1));
        } else if (input) {
          setUserInput((prev) => prev + input);
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
          setPhase('category');
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
    if (phase === 'generating' && recipeName && category) {
      const runGenerate = async () => {
        try {
          const progressCallback: ProgressCallback = (step) => {
            setStep(step);
          };

          const result = await performRecipesGenerate(
            {
              ...options,
              name: recipeName,
              magicGenerate: useMagic,
              category,
            },
            progressCallback
          );

          setPhase('complete');
          onComplete(result);
        } catch (err) {
          onError(err instanceof Error ? err : new Error(String(err)));
        }
      };
      runGenerate();
    }
  }, [phase, recipeName, useMagic, category, options, onComplete, onError]);

  if (phase === 'input' && shouldUseInput) {
    return (
      <Box flexDirection="column">
        <Text color="blue">🎯 Recipe name: {userInput}</Text>
        <Text color="gray">Enter a name for your recipe and press Enter</Text>
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

  if (phase === 'generating') {
    return (
      <Box flexDirection="column">
        <Text color="blue">🎯 {step || 'Generating recipe...'}</Text>
      </Box>
    );
  }

  return null;
};
