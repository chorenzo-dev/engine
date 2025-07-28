import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { RecipeGenerateProgress } from '../components/RecipeGenerateProgress';
import {
  performRecipesGenerate,
  type GenerateResult as RecipeGenerateResult,
} from '../commands/recipes';

interface GenerateContainerProps {
  options: {
    name?: string;
    progress?: boolean;
    cost?: boolean;
    saveLocation?: string;
    category?: string;
    summary?: string;
  };
  onComplete: (result: RecipeGenerateResult) => void;
  onError: (error: Error) => void;
}

export const GenerateContainer: React.FC<GenerateContainerProps> = ({
  options,
  onComplete,
  onError,
}) => {
  const [result, setResult] = useState<RecipeGenerateResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [simpleStep, setSimpleStep] = useState<string>('');

  useEffect(() => {
    if (options.progress === false && !isComplete && !error) {
      const runRecipesGenerate = async () => {
        try {
          const generateResult = await performRecipesGenerate(
            {
              name: options.name,
              progress: options.progress,
              cost: options.cost,
              saveLocation: options.saveLocation,
              category: options.category,
              summary: options.summary,
            },
            (step) => {
              setSimpleStep(step || '');
            }
          );

          setResult(generateResult);
          setIsComplete(true);
          onComplete(generateResult);
        } catch (err) {
          const errorObj = err instanceof Error ? err : new Error(String(err));
          setError(errorObj);
          onError(errorObj);
        }
      };
      runRecipesGenerate();
    }
  }, [options, isComplete, error, onComplete, onError]);

  if (options.progress === false) {
    if (error) {
      return (
        <Box flexDirection="column">
          <Text color="red">❌ Error: {error.message}</Text>
        </Box>
      );
    }

    if (isComplete && result) {
      return (
        <Box flexDirection="column">
          <Text color="green">✅ Recipe generated successfully!</Text>
          <Text>Path: {result.recipePath}</Text>
          <Text>Name: {result.recipeName}</Text>
          {result.metadata && options.cost && (
            <>
              <Text>Cost: ${result.metadata.costUsd.toFixed(4)}</Text>
              <Text>
                Duration: {result.metadata.durationSeconds.toFixed(1)}s
              </Text>
            </>
          )}
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        <Text color="blue">🎯 {simpleStep || 'Generating recipe...'}</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">❌ Error: {error.message}</Text>
      </Box>
    );
  }

  if (isComplete && result) {
    return (
      <Box flexDirection="column">
        <Text color="green">✅ Recipe generated successfully!</Text>
        <Text>Path: {result.recipePath}</Text>
        <Text>Name: {result.recipeName}</Text>
        {result.metadata && options.cost && (
          <>
            <Text>Cost: ${result.metadata.costUsd.toFixed(4)}</Text>
            <Text>Duration: {result.metadata.durationSeconds.toFixed(1)}s</Text>
          </>
        )}
      </Box>
    );
  }

  return (
    <RecipeGenerateProgress
      options={options}
      onComplete={(generateResult) => {
        setResult(generateResult);
        setIsComplete(true);
        onComplete(generateResult);
      }}
      onError={(error, collectedOptions) => {
        if (collectedOptions && collectedOptions.name) {
          let cliCommand = `npx chorenzo recipes generate "${collectedOptions.name}"`;
          if (collectedOptions.category) {
            cliCommand += ` --category "${collectedOptions.category}"`;
          }
          if (collectedOptions.summary) {
            cliCommand += ` --summary "${collectedOptions.summary}"`;
          }
          if (collectedOptions.saveLocation) {
            cliCommand += ` --location "${collectedOptions.saveLocation}"`;
          }

          const enhancedError = new Error(
            `${error.message}\n\nCLI command to retry:\n${cliCommand}`
          );
          setError(enhancedError);
          onError(enhancedError);
        } else {
          setError(error);
          onError(error);
        }
      }}
    />
  );
};
