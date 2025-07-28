import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { InitContainer } from '../containers/InitContainer';
import { AnalyzeContainer } from '../containers/AnalyzeContainer';
import { RecipesContainer } from '../containers/RecipesContainer';
import { RecipeGenerateProgress } from './RecipeGenerateProgress';
import { AnalysisResult } from '../commands/analyze';
import {
  performRecipesGenerate,
  type ValidationResult,
  type GenerateResult as RecipeGenerateResult,
} from '../commands/recipes';
import { AnalysisDisplay } from './AnalysisDisplay';
import { ApplyDisplay } from './ApplyDisplay';
import { ApplyRecipeResult } from '../types/apply';

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
  const [simpleStep, setSimpleStep] = useState<string>('');

  useEffect(() => {
    if (
      command === 'recipes-generate' &&
      options.progress === false &&
      !isComplete &&
      !error
    ) {
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
              if (step) {
                setSimpleStep(step);
              }
            }
          );

          setCommandState({
            command: 'recipes-generate',
            result: generateResult,
          });
          setIsComplete(true);
        } catch (err) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      };
      runRecipesGenerate();
    }
  }, [
    command,
    options.progress,
    options.name,
    options.cost,
    options.saveLocation,
    options.category,
    options.summary,
    isComplete,
    error,
  ]);
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
    if (options.progress === false) {
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
        <Box flexDirection="column">
          <Text color="blue">🎯 {simpleStep || 'Generating recipe...'}</Text>
        </Box>
      );
    }

    if (error && isComplete) {
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
      <RecipeGenerateProgress
        options={{
          name: options.name,
          progress: options.progress,
          cost: options.cost,
          saveLocation: options.saveLocation,
          category: options.category,
          summary: options.summary,
        }}
        onComplete={(result) => {
          setCommandState({ command: 'recipes-generate', result });
          setIsComplete(true);
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
          } else {
            setError(error);
          }
          setIsComplete(true);
        }}
      />
    );
  }

  return <Text>Unknown command: {command}</Text>;
};
