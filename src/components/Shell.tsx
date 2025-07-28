import { Box, Text } from 'ink';
import React, { useState } from 'react';

import { AnalysisResult } from '~/commands/analyze';
import {
  type GenerateResult as RecipeGenerateResult,
  type ValidationResult,
} from '~/commands/recipes';
import { AnalyzeContainer } from '~/containers/AnalyzeContainer';
import { InitContainer } from '~/containers/InitContainer';
import { RecipesContainer } from '~/containers/RecipesContainer';
import { ApplyRecipeResult } from '~/types/apply';

import { AnalysisDisplay } from './AnalysisDisplay';
import { ApplyDisplay } from './ApplyDisplay';

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
  | { command: 'recipes-apply'; result: ApplyRecipeResult | null }
  | { command: 'recipes-generate'; result: RecipeGenerateResult | null };

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
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);
  if (command === 'analyze') {
    if (error) {
      return (
        <Box flexDirection="column">
          <Text color="red">❌ Error: {error.message}</Text>
        </Box>
      );
    }

    if (
      isComplete &&
      commandState.command === 'analyze' &&
      commandState.result
    ) {
      return (
        <AnalysisDisplay result={commandState.result} showCost={options.cost} />
      );
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
      return (
        <Box flexDirection="column">
          <Text color="red">❌ Error: {error.message}</Text>
        </Box>
      );
    }

    if (isComplete) {
      return (
        <Box flexDirection="column">
          <Text color="green">✅ Initialization complete!</Text>
          {commandState.command === 'init' &&
          commandState.result &&
          commandState.result.analysis ? (
            <Box marginTop={1}>
              <AnalysisDisplay
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
    if (error) {
      return (
        <Box flexDirection="column">
          <Text color="red">❌ Error: {error.message}</Text>
        </Box>
      );
    }

    if (isComplete && validationResult) {
      return (
        <Box flexDirection="column">
          {validationResult.messages.map((msg, index) => {
            let icon = '';
            switch (msg.type) {
              case 'success':
                icon = '✅';
                break;
              case 'error':
                icon = '❌';
                break;
              case 'warning':
                icon = '⚠️ ';
                break;
              case 'info':
                icon = '📊';
                break;
            }
            return <Text key={index}>{`${icon} ${msg.text}`}</Text>;
          })}
          {validationResult.summary && (
            <Box marginTop={1} flexDirection="column">
              <Text>📊 Summary:</Text>
              <Text>{`  Valid recipes: ${validationResult.summary.valid}/${validationResult.summary.total}`}</Text>
              {validationResult.summary.totalErrors > 0 && (
                <Text>{`  Total errors: ${validationResult.summary.totalErrors}`}</Text>
              )}
              {validationResult.summary.totalWarnings > 0 && (
                <Text>{`  Total warnings: ${validationResult.summary.totalWarnings}`}</Text>
              )}
            </Box>
          )}
          <Box marginTop={1}>
            <Text color="green">✅ Recipe validation complete!</Text>
          </Box>
        </Box>
      );
    }

    return (
      <RecipesContainer
        command="validate"
        options={{
          target: options.target,
          progress: options.progress,
        }}
        onComplete={(result) => {
          setValidationResult(result as ValidationResult);
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
      return (
        <Box flexDirection="column">
          <Text color="red">❌ Error: {error.message}</Text>
        </Box>
      );
    }

    if (
      isComplete &&
      commandState.command === 'recipes-apply' &&
      commandState.result
    ) {
      return (
        <ApplyDisplay result={commandState.result} showCost={options.cost} />
      );
    }

    return (
      <RecipesContainer
        command="apply"
        options={{
          recipe: options.recipe,
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
            result: result as ApplyRecipeResult,
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
      return (
        <Box flexDirection="column">
          <Text color="red">❌ Error: {error.message}</Text>
        </Box>
      );
    }

    if (
      isComplete &&
      commandState.command === 'recipes-generate' &&
      commandState.result
    ) {
      return (
        <Box flexDirection="column">
          <Text color="green">✅ Recipe generated successfully!</Text>
          <Text>Path: {commandState.result.recipePath}</Text>
          <Text>Name: {commandState.result.recipeName}</Text>
          {commandState.result.metadata && options.cost && (
            <>
              <Text>
                Cost: ${commandState.result.metadata.costUsd.toFixed(4)}
              </Text>
              <Text>
                Duration:{' '}
                {commandState.result.metadata.durationSeconds.toFixed(1)}s
              </Text>
            </>
          )}
        </Box>
      );
    }

    return (
      <RecipesContainer
        command="generate"
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
            result: result as RecipeGenerateResult,
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
