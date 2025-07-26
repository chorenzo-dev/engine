import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import {
  performRecipesGenerate,
  type GenerateOptions,
  type GenerateResult,
  type ProgressCallback,
} from '../commands/recipes';

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
    'input' | 'choice' | 'generating' | 'complete'
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
  const { isRawModeSupported } = useStdin();

  const shouldUseInput = options.progress !== false && isRawModeSupported;

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
      setPhase('generating');
    }
  }, [phase, options.name, shouldUseInput, onError]);

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
            setPhase('generating');
          } else {
            setUseMagic(false);
            setPhase('generating');
          }
          setUserInput('');
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
    if (phase === 'generating' && recipeName) {
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
  }, [phase, recipeName, useMagic, options, onComplete, onError]);

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

  if (phase === 'generating') {
    return (
      <Box flexDirection="column">
        <Text color="blue">🎯 {step || 'Generating recipe...'}</Text>
      </Box>
    );
  }

  return null;
};
