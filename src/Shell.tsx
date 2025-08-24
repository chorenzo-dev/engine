import { Text } from 'ink';
import React, { useState } from 'react';

import { AnalysisValidateContainer } from '~/containers/AnalysisValidateContainer';
import { AnalyzeContainer } from '~/containers/AnalyzeContainer';
import { InitContainer } from '~/containers/InitContainer';
import { RecipesApplyContainer } from '~/containers/RecipesApplyContainer';
import { RecipesGenerateContainer } from '~/containers/RecipesGenerateContainer';
import { RecipesListContainer } from '~/containers/RecipesListContainer';
import { RecipesShowContainer } from '~/containers/RecipesShowContainer';
import { RecipesValidateContainer } from '~/containers/RecipesValidateContainer';

import { ErrorExitComponent } from './components/ErrorExitComponent';

interface ShellProps {
  command:
    | 'analyze'
    | 'analysis.validate'
    | 'init'
    | 'recipes-validate'
    | 'recipes-review'
    | 'recipes-apply'
    | 'recipes-generate'
    | 'recipes-list'
    | 'recipes-show';
  options: {
    reset?: boolean;
    noAnalyze?: boolean;
    yes?: boolean;
    target?: string;
    recipe?: string;
    variant?: string;
    project?: string;
    force?: boolean;
    debug?: boolean;
    cost?: boolean;
    name?: string;
    saveLocation?: string;
    category?: string;
    summary?: string;
    ecosystemAgnostic?: boolean;
    magicGenerate?: boolean;
    additionalInstructions?: string;
    recipeName?: string;
    file?: string;
  };
}

export const Shell: React.FC<ShellProps> = ({
  command: initialCommand,
  options: initialOptions,
}) => {
  const [error, setError] = useState<Error | null>(null);
  const [command, setCommand] = useState(initialCommand);
  const [options, setOptions] = useState(initialOptions);
  if (command === 'analyze') {
    if (error) {
      return <ErrorExitComponent error={error} />;
    }

    return (
      <AnalyzeContainer
        options={{
          debug: options.debug,
          cost: options.cost,
        }}
        onError={(error) => {
          setError(error);
        }}
      />
    );
  }

  if (command === 'analysis.validate') {
    if (error) {
      return <ErrorExitComponent error={error} />;
    }

    return (
      <AnalysisValidateContainer
        options={{
          file: options.file,
          debug: options.debug,
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
          debug: options.debug,
          cost: options.cost,
        }}
        onComplete={(shouldRunAnalysis) => {
          if (shouldRunAnalysis) {
            setCommand('analyze');
            setOptions({
              debug: options.debug,
              cost: options.cost,
            });
            setError(null);
          }
        }}
      />
    );
  }

  if (command === 'recipes-validate') {
    if (error) {
      return <ErrorExitComponent error={error} />;
    }

    if (!options.target) {
      return (
        <ErrorExitComponent error={new Error('Target parameter is required')} />
      );
    }

    return (
      <RecipesValidateContainer
        options={{
          target: options.target,
          debug: options.debug,
        }}
        onError={(error) => {
          setError(error);
        }}
      />
    );
  }

  if (command === 'recipes-apply') {
    if (error) {
      return <ErrorExitComponent error={error} />;
    }

    if (!options.recipe) {
      return (
        <ErrorExitComponent error={new Error('Recipe parameter is required')} />
      );
    }

    return (
      <RecipesApplyContainer
        options={{
          recipe: options.recipe,
          variant: options.variant,
          project: options.project,
          yes: options.yes,
          force: options.force,
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
      return <ErrorExitComponent error={error} />;
    }

    return (
      <RecipesGenerateContainer
        options={{
          name: options.name,
          debug: options.debug,
          cost: options.cost,
          saveLocation: options.saveLocation,
          category: options.category,
          summary: options.summary,
          ecosystemAgnostic: options.ecosystemAgnostic,
          magicGenerate: options.magicGenerate,
          additionalInstructions: options.additionalInstructions,
        }}
        onError={(error) => {
          setError(error);
        }}
      />
    );
  }

  if (command === 'recipes-show') {
    if (error) {
      return <ErrorExitComponent error={error} />;
    }

    if (!options.recipeName) {
      return (
        <ErrorExitComponent
          error={new Error('Recipe name parameter is required')}
        />
      );
    }

    return (
      <RecipesShowContainer
        options={{
          recipeName: options.recipeName,
          debug: options.debug,
        }}
        onError={(error) => {
          setError(error);
        }}
      />
    );
  }

  if (command === 'recipes-list') {
    if (error) {
      return <ErrorExitComponent error={error} />;
    }

    return (
      <RecipesListContainer
        onError={(error) => {
          setError(error);
        }}
        onApply={(recipe) => {
          setCommand('recipes-apply');
          setOptions({ ...options, recipe });
          setError(null);
        }}
      />
    );
  }

  return <Text>Unknown command: {command}</Text>;
};
