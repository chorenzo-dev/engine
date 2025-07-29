import { Box, Text } from 'ink';
import React, { useState } from 'react';

import { AnalysisResult } from '~/commands/analyze';
import { type ValidationResult } from '~/commands/recipes';
import { AnalyzeContainer } from '~/containers/AnalyzeContainer';
import { InitContainer } from '~/containers/InitContainer';
import { RecipesApplyContainer } from '~/containers/RecipesApplyContainer';
import { RecipesGenerateContainer } from '~/containers/RecipesGenerateContainer';
import { RecipesValidateContainer } from '~/containers/RecipesValidateContainer';
import { colors } from '~/styles/colors';
import { RecipesApplyResult } from '~/types/recipes-apply';
import { RecipesGenerateResult } from '~/types/recipes-generate';

import { AnalysisResultDisplay } from './AnalysisResultDisplay';
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

type ShellState =
  | { command: 'analyze'; result: AnalysisResult | null }
  | { command: 'init'; result: AnalysisResult | null }
  | { command: 'recipes-validate'; result: ValidationResult | null }
  | { command: 'recipes-apply'; result: RecipesApplyResult | null }
  | { command: 'recipes-generate'; result: RecipesGenerateResult | null };

export const Shell: React.FC<ShellProps> = ({ command, options }) => {
  const [commandState, setCommandState] = useState<ShellState>(
    () =>
      ({
        command,
        result: null,
      }) as ShellState
  );
  const [error, setError] = useState<Error | null>(null);
  const [isComplete, setIsComplete] = useState(false);
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
        onComplete={(result) => {
          setCommandState({ command: 'analyze', result });
          setIsComplete(true);
        }}
        onError={(error) => {
          setError(error);
        }}
      />
    );
  }

  if (command === 'init') {
    if (error) {
      return <CommandFlow title="Error" status="error" error={error.message} />;
    }

    if (isComplete) {
      return (
        <Box flexDirection="column">
          <Text color={colors.success}>✅ Initialization complete!</Text>
          {commandState.command === 'init' &&
          commandState.result &&
          commandState.result.analysis ? (
            <Box marginTop={1}>
              <AnalysisResultDisplay
                result={commandState.result}
                showCost={options.cost}
              />
            </Box>
          ) : null}
        </Box>
      );
    }

    return (
      <InitContainer
        options={{
          reset: options.reset,
          noAnalyze: options.noAnalyze,
          yes: options.yes,
          progress: options.progress,
          cost: options.cost,
        }}
        onComplete={(result) => {
          setCommandState({ command: 'init', result: result || null });
          setIsComplete(true);
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
        onComplete={(result) => {
          setCommandState({
            command: 'recipes-validate',
            result,
          });
          setIsComplete(true);
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
        onComplete={(result) => {
          setCommandState({
            command: 'recipes-apply',
            result,
          });
          setIsComplete(true);
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
        onComplete={(result) => {
          setCommandState({
            command: 'recipes-generate',
            result,
          });
          setIsComplete(true);
        }}
        onError={(error) => {
          setError(error);
        }}
      />
    );
  }

  return <Text>Unknown command: {command}</Text>;
};
