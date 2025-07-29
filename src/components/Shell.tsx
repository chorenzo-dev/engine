import { Text } from 'ink';
import React, { useState } from 'react';

import { AnalyzeContainer } from '~/containers/AnalyzeContainer';
import { InitContainer } from '~/containers/InitContainer';
import { RecipesApplyContainer } from '~/containers/RecipesApplyContainer';
import { RecipesGenerateContainer } from '~/containers/RecipesGenerateContainer';
import { RecipesValidateContainer } from '~/containers/RecipesValidateContainer';

import { CommandFlow } from './CommandFlow';

interface ShellProps {
  command:
    | 'analyze'
    | 'init'
    | 'recipes-validate'
    | 'recipes-apply'
    | 'recipes-generate';
  options: {
    progress?: boolean;
    reset?: boolean;
    noAnalyze?: boolean;
    yes?: boolean;
    target?: string;
    recipe?: string;
    variant?: string;
    project?: string;
    debug?: boolean;
    cost?: boolean;
    name?: string;
    saveLocation?: string;
    category?: string;
    summary?: string;
  };
}

export const Shell: React.FC<ShellProps> = ({ command, options }) => {
  const [error, setError] = useState<Error | null>(null);
  if (command === 'analyze') {
    if (error) {
      return <CommandFlow title="Error" status="error" error={error.message} />;
    }

    return (
      <AnalyzeContainer
        options={{
          progress: options.progress,
          cost: options.cost,
        }}
        onError={(error) => {
          setError(error);
        }}
      />
    );
  }

  if (command === 'init') {
    return (
      <InitContainer
        options={{
          reset: options.reset,
          noAnalyze: options.noAnalyze,
          yes: options.yes,
          progress: options.progress,
          cost: options.cost,
        }}
        onError={(error) => {
          setError(error);
        }}
      />
    );
  }

  if (command === 'recipes-validate') {
    if (!options.target) {
      return (
        <CommandFlow
          title="Error"
          status="error"
          error="Target parameter is required"
        />
      );
    }

    return (
      <RecipesValidateContainer
        options={{
          target: options.target,
          progress: options.progress,
        }}
        onError={(error) => {
          setError(error);
        }}
      />
    );
  }

  if (command === 'recipes-apply') {
    if (error) {
      return <CommandFlow title="Error" status="error" error={error.message} />;
    }

    return (
      <RecipesApplyContainer
        options={{
          recipe: options.recipe!,
          variant: options.variant,
          project: options.project,
          yes: options.yes,
          progress: options.progress,
          debug: options.debug,
          cost: options.cost,
        }}
        onError={(error) => {
          setError(error);
        }}
      />
    );
  }

  if (command === 'recipes-generate') {
    if (error) {
      return <CommandFlow title="Error" status="error" error={error.message} />;
    }

    return (
      <RecipesGenerateContainer
        options={{
          name: options.name,
          progress: options.progress,
          cost: options.cost,
          saveLocation: options.saveLocation,
          category: options.category,
          summary: options.summary,
        }}
        onError={(error) => {
          setError(error);
        }}
      />
    );
  }

  return <Text>Unknown command: {command}</Text>;
};
