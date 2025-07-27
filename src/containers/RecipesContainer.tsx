import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { ApplyProgress } from '../components/ApplyProgress';
import { DebugProgress } from '../components/DebugProgress';
import { ApplyDisplay } from '../components/ApplyDisplay';
import {
  performRecipesValidate,
  performRecipesApply,
  type ValidationCallback,
  type ValidationResult,
} from '../commands/recipes';
import { ApplyOptions, ApplyRecipeResult } from '../types/apply';

interface RecipesContainerProps {
  command: 'validate' | 'apply';
  options: {
    target?: string;
    recipe?: string;
    variant?: string;
    project?: string;
    yes?: boolean;
    progress?: boolean;
    debug?: boolean;
    cost?: boolean;
  };
  onComplete: (result: ValidationResult | ApplyRecipeResult) => void;
  onError: (error: Error) => void;
}

export const RecipesContainer: React.FC<RecipesContainerProps> = ({
  command,
  options,
  onComplete,
  onError,
}) => {
  const [result, setResult] = useState<
    ValidationResult | ApplyRecipeResult | null
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
          const handleValidation: ValidationCallback = (type, message) => {
            switch (type) {
              case 'success':
                console.log(`✅ ${message}`);
                break;
              case 'error':
                console.error(`❌ ${message}`);
                break;
              case 'warning':
                console.warn(`⚠️ ${message}`);
                break;
              case 'info':
                console.info(`📊 ${message}`);
                break;
            }
          };

          const validationResult = await performRecipesValidate(
            {
              target: options.target!,
              progress: options.progress,
            },
            (step) => {
              setSimpleStep(step);
            },
            handleValidation
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
      command === 'apply' &&
      options.progress === false &&
      !options.debug &&
      !isComplete &&
      !error
    ) {
      if (!options.recipe) {
        const errorObj = new Error('Recipe parameter is required');
        setError(errorObj);
        onError(errorObj);
        return;
      }

      const runRecipesApply = async () => {
        try {
          const applyResult = await performRecipesApply(
            {
              recipe: options.recipe!,
              variant: options.variant,
              project: options.project,
              yes: options.yes,
              progress: options.progress,
            },
            (step) => {
              setSimpleStep(step);
            }
          );

          setResult(applyResult);
          setIsComplete(true);
          onComplete(applyResult);
        } catch (err) {
          const errorObj = err instanceof Error ? err : new Error(String(err));
          setError(errorObj);
          onError(errorObj);
        }
      };
      runRecipesApply();
    }
  }, [
    command,
    options.target,
    options.recipe,
    options.variant,
    options.project,
    options.yes,
    options.progress,
    options.debug,
    isComplete,
    error,
    onComplete,
    onError,
  ]);

  if (command === 'validate') {
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
      <Box flexDirection="column">
        <Text color="blue">🔍 {simpleStep || 'Validating recipe...'}</Text>
      </Box>
    );
  }

  if (command === 'apply') {
    if (!options.recipe) {
      return (
        <Box flexDirection="column">
          <Text color="red">❌ Error: Recipe parameter is required</Text>
        </Box>
      );
    }

    if (options.debug) {
      if (error) {
        return (
          <Box flexDirection="column">
            <Text color="red">❌ Error: {error.message}</Text>
          </Box>
        );
      }

      const applyOptions: ApplyOptions = {
        recipe: options.recipe,
        variant: options.variant,
        project: options.project,
        yes: options.yes,
        progress: options.progress,
        cost: options.cost,
      };

      return (
        <DebugProgress
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
          <ApplyDisplay
            result={result as ApplyRecipeResult}
            showCost={options.cost}
          />
        );
      }

      return (
        <Box flexDirection="column">
          <Text color="blue">🔧 {simpleStep || 'Applying recipe...'}</Text>
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
        <ApplyDisplay
          result={result as ApplyRecipeResult}
          showCost={options.cost}
        />
      );
    }

    const applyOptions: ApplyOptions = {
      recipe: options.recipe,
      variant: options.variant,
      project: options.project,
      yes: options.yes,
      progress: options.progress,
      cost: options.cost,
    };

    return (
      <ApplyProgress
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

  return <Text>Unknown recipes command: {command}</Text>;
};
