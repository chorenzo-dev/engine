import { Text } from 'ink';
import React, { useState } from 'react';

import { CommandFlow } from '~/components/CommandFlow';
import { MetadataDisplay } from '~/components/MetadataDisplay';
import { RecipesGenerateFlow } from '~/components/RecipesGenerateFlow';
import {
  RecipesGenerateOptions,
  RecipesGenerateResult,
} from '~/types/recipes-generate';

interface RecipesGenerateContainerProps {
  options: RecipesGenerateOptions;
  onError: (error: Error) => void;
}

export const RecipesGenerateContainer: React.FC<
  RecipesGenerateContainerProps
> = ({ options, onError }) => {
  const [result, setResult] = useState<RecipesGenerateResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  const handleComplete = (generateResult: RecipesGenerateResult) => {
    setResult(generateResult);
    setIsComplete(true);
  };

  const handleError = (
    err: Error,
    collectedOptions?: RecipesGenerateOptions
  ) => {
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
        `${err.message}\n\nCLI command to retry:\n${cliCommand}`
      );
      setError(enhancedError);
      onError(enhancedError);
    } else {
      setError(err);
      onError(err);
    }
  };

  if (error) {
    return <CommandFlow title="Error" status="error" error={error.message} />;
  }

  if (isComplete && result) {
    return (
      <CommandFlow title="Recipe generated successfully!" status="completed">
        <Text>Path: {result.recipePath}</Text>
        <Text>Name: {result.recipeName}</Text>
        {result.metadata && (
          <MetadataDisplay metadata={result.metadata} showCost={options.cost} />
        )}
      </CommandFlow>
    );
  }

  return (
    <RecipesGenerateFlow
      options={options}
      onComplete={handleComplete}
      onError={handleError}
    />
  );
};
