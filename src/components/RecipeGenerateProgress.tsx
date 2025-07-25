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
  const [phase, setPhase] = useState<'input' | 'generating' | 'complete'>(
    () => {
      if (options.name) {
        return 'generating';
      }
      return 'input';
    }
  );
  const [step, setStep] = useState<string>('');
  const [userInput, setUserInput] = useState<string>('');
  const [recipeName, setRecipeName] = useState<string>(options.name || '');
  const { isRawModeSupported } = useStdin();

  const shouldUseInput = options.progress !== false && isRawModeSupported;

  useEffect(() => {
    if (phase === 'input') {
      if (options.name) {
        setRecipeName(options.name);
        setPhase('generating');
      } else if (!shouldUseInput) {
        onError(
          new Error(
            'Recipe name is required. Use: chorenzo recipes generate <name>'
          )
        );
      }
    }
  }, [phase, options.name, shouldUseInput, onError]);

  useInput(
    (input, key) => {
      if (phase === 'input') {
        if (key.return) {
          const name = userInput.trim();
          if (name) {
            setRecipeName(name);
            setPhase('generating');
            setUserInput('');
          }
        } else if (key.backspace) {
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
  }, [phase, recipeName, options, onComplete, onError]);

  if (phase === 'input' && shouldUseInput) {
    return (
      <Box flexDirection="column">
        <Text color="blue">🎯 Recipe name: {userInput}</Text>
        <Text color="gray">Enter a name for your recipe and press Enter</Text>
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
