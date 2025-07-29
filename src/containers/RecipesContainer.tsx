import { Box, Text } from 'ink';
import React, { useEffect, useState } from 'react';

import {
  type GenerateResult as RecipeGenerateResult,
  type ValidationResult,
  performRecipesGenerate,
  performRecipesValidate,
} from '~/commands/recipes';
import { CommandFlow } from '~/components/CommandFlow';
import { emojis } from '~/components/CommandFlow';
import { RecipeGenerateProgress } from '~/components/RecipeGenerateProgress';
import { RecipesApplyContainer } from '~/containers/RecipesApplyContainer';
import { RecipesApplyOptions, RecipesApplyResult } from '~/types/recipes-apply';

interface RecipesContainerProps {
  command: 'validate' | 'apply' | 'generate';
  options: {
    target?: string;
    recipe?: string;
    variant?: string;
    project?: string;
    yes?: boolean;
    progress?: boolean;
    debug?: boolean;
    cost?: boolean;
    name?: string;
    saveLocation?: string;
    category?: string;
    summary?: string;
  };
  onComplete: (
    result: ValidationResult | RecipesApplyResult | RecipeGenerateResult
  ) => void;
  onError: (error: Error) => void;
}

export const RecipesContainer: React.FC<RecipesContainerProps> = ({
  command,
  options,
  onComplete,
  onError,
}) => {
  const [result, setResult] = useState<
    ValidationResult | RecipesApplyResult | RecipeGenerateResult | null
  >(null);
  const [error, setError] = useState<Error | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [simpleStep, setSimpleStep] = useState<string>('');
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);

  useEffect(() => {
    if (command === 'validate' && !isComplete && !error) {
      if (!options.target) {
        const errorObj = new Error('Target parameter is required');
        setError(errorObj);
        onError(errorObj);
        return;
      }

      const runRecipesValidate = async () => {
        try {
          const validationResult = await performRecipesValidate(
            {
              target: options.target!,
              progress: options.progress,
            },
            (step) => {
              setSimpleStep(step || '');
            }
          );

          setValidationResult(validationResult);
          setResult(validationResult);
          setIsComplete(true);
          onComplete(validationResult);
        } catch (err) {
          const errorObj = err instanceof Error ? err : new Error(String(err));
          setError(errorObj);
          onError(errorObj);
        }
      };
      runRecipesValidate();
    }

    if (
      command === 'generate' &&
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
  }, [
    command,
    options.target,
    options.progress,
    options.name,
    options.cost,
    options.saveLocation,
    options.category,
    options.summary,
    isComplete,
    error,
    onComplete,
    onError,
  ]);

  if (command === 'validate') {
    if (error) {
      return <CommandFlow title="Error" status="error" error={error.message} />;
    }

    if (isComplete && validationResult) {
      return (
        <CommandFlow title="Recipe validation complete!" status="completed">
          <Box flexDirection="column">
            {validationResult.messages.map((msg, index) => {
              let icon = '';
              switch (msg.type) {
                case 'success':
                  icon = emojis.success;
                  break;
                case 'error':
                  icon = emojis.error;
                  break;
                case 'warning':
                case 'info':
                  icon = '';
                  break;
              }
              return (
                <Text key={index}>
                  {icon ? `${icon} ` : ''}
                  {msg.text}
                </Text>
              );
            })}
            {validationResult.summary && (
              <Box marginTop={1} flexDirection="column">
                <Text>Summary:</Text>
                <Text>{`  Valid recipes: ${validationResult.summary.valid}/${validationResult.summary.total}`}</Text>
                {validationResult.summary.totalErrors > 0 && (
                  <Text>{`  Total errors: ${validationResult.summary.totalErrors}`}</Text>
                )}
                {validationResult.summary.totalWarnings > 0 && (
                  <Text>{`  Total warnings: ${validationResult.summary.totalWarnings}`}</Text>
                )}
              </Box>
            )}
          </Box>
        </CommandFlow>
      );
    }

    return (
      <CommandFlow
        title={simpleStep || 'Validating recipe...'}
        status="in_progress"
      />
    );
  }

  if (command === 'apply') {
    const applyOptions: RecipesApplyOptions & {
      progress?: boolean;
      debug?: boolean;
    } = {
      recipe: options.recipe!,
      variant: options.variant,
      project: options.project,
      yes: options.yes,
      progress: options.progress,
      cost: options.cost,
      debug: options.debug,
    };

    return (
      <RecipesApplyContainer
        options={applyOptions}
        onComplete={(applyResult) => {
          setResult(applyResult);
          setIsComplete(true);
          onComplete(applyResult);
        }}
        onError={(error) => {
          setError(error);
          onError(error);
        }}
      />
    );
  }

  if (command === 'generate') {
    if (error) {
      return <CommandFlow title="Error" status="error" error={error.message} />;
    }

    if (isComplete && result) {
      return (
        <CommandFlow title="Recipe generated successfully!" status="completed">
          <Box flexDirection="column">
            <Text>Path: {(result as RecipeGenerateResult).recipePath}</Text>
            <Text>Name: {(result as RecipeGenerateResult).recipeName}</Text>
            {(result as RecipeGenerateResult).metadata && options.cost && (
              <>
                <Text>
                  Cost: $
                  {(result as RecipeGenerateResult).metadata!.costUsd.toFixed(
                    4
                  )}
                </Text>
                <Text>
                  Duration:{' '}
                  {(
                    result as RecipeGenerateResult
                  ).metadata!.durationSeconds.toFixed(1)}
                  s
                </Text>
              </>
            )}
          </Box>
        </CommandFlow>
      );
    }

    if (options.progress === false) {
      return (
        <CommandFlow
          title={simpleStep || 'Generating recipe...'}
          status="in_progress"
        />
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
  }

  return <Text>Unknown recipes command: {command}</Text>;
};
