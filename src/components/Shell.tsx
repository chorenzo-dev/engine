import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { AnalysisProgress } from './AnalysisProgress';
import { InitWithAnalysis } from './InitWithAnalysis';
import { ApplyProgress } from './ApplyProgress';
import { ApplyDisplay } from './ApplyDisplay';
import { performAnalysis } from '../commands/analyze';
import { performInit } from '../commands/init';
import {
  performRecipesValidate,
  performRecipesApply,
  type ValidationCallback,
  type ValidationResult,
} from '../commands/recipes';
import { AnalysisDisplay } from './AnalysisDisplay';
import { ApplyOptions, ApplyRecipeResult } from '../types/apply';

interface ShellProps {
  command: 'analyze' | 'init' | 'recipes-validate' | 'recipes-apply';
  options: {
    progress?: boolean;
    reset?: boolean;
    noAnalyze?: boolean;
    yes?: boolean;
    target?: string;
    recipe?: string;
    variant?: string;
    project?: string;
  };
}

export const Shell: React.FC<ShellProps> = ({ command, options }) => {
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [simpleStep, setSimpleStep] = useState<string>('');
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);

  useEffect(() => {
    if (
      command === 'analyze' &&
      options.progress === false &&
      !isComplete &&
      !error
    ) {
      const runSimpleAnalysis = async () => {
        try {
          const analysisResult = await performAnalysis((step) => {
            setSimpleStep(step);
          });
          setResult(analysisResult);
          setIsComplete(true);
        } catch (err) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      };
      runSimpleAnalysis();
    }

    if (command === 'recipes-validate' && !isComplete && !error) {
      if (!options.target) {
        setError(new Error('Target parameter is required'));
        return;
      }

      const runRecipesValidate = async () => {
        try {
          const handleValidation: ValidationCallback = (type, message) => {
            let formattedMessage: string;
            switch (type) {
              case 'success':
                formattedMessage = `✅ ${message}`;
                break;
              case 'error':
                formattedMessage = `❌ ${message}`;
                break;
              case 'warning':
                formattedMessage = `⚠️  ${message}`;
                break;
              case 'info':
                formattedMessage = `📊 ${message}`;
                break;
            }
          };

          const result = await performRecipesValidate(
            {
              target: options.target!,
              progress: options.progress,
            },
            (step) => {
              setSimpleStep(step);
            },
            handleValidation
          );

          setValidationResult(result);
          setIsComplete(true);
        } catch (err) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      };
      runRecipesValidate();
    }

    if (
      command === 'recipes-apply' &&
      options.progress === false &&
      !isComplete &&
      !error
    ) {
      if (!options.recipe) {
        setError(new Error('Recipe parameter is required'));
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
        } catch (err) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      };
      runRecipesApply();
    }
  }, [
    command,
    options.progress,
    options.reset,
    options.target,
    options.recipe,
    options.variant,
    options.project,
    options.yes,
    isComplete,
    error,
  ]);

  if (command === 'analyze') {
    if (options.progress === false) {
      if (error) {
        return (
          <Box flexDirection="column">
            <Text color="red">❌ Error: {error.message}</Text>
          </Box>
        );
      }

      if (isComplete && result) {
        return <AnalysisDisplay result={result} />;
      }

      return (
        <Box flexDirection="column">
          <Text color="blue">🔍 {simpleStep || 'Analyzing workspace...'}</Text>
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
      return <AnalysisDisplay result={result} />;
    }

    return (
      <AnalysisProgress
        onComplete={(result) => {
          setResult(result);
          setIsComplete(true);
        }}
        onError={(error) => {
          setError(error);
        }}
      />
    );
  }

  if (command === 'init') {
    if (options.progress === false) {
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
            {result && result.analysis && (
              <Box marginTop={1}>
                <AnalysisDisplay result={result} />
              </Box>
            )}
          </Box>
        );
      }

      return (
        <InitWithAnalysis
          options={{
            reset: options.reset,
            noAnalyze: options.noAnalyze,
            yes: options.yes,
            progress: options.progress,
          }}
          onComplete={(result) => {
            setResult(result);
            setIsComplete(true);
          }}
          onError={(error) => {
            setError(error);
          }}
        />
      );
    }
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
      <Box flexDirection="column">
        <Text color="blue">🔍 {simpleStep || 'Validating recipe...'}</Text>
      </Box>
    );
  }

  if (command === 'recipes-apply') {
    if (!options.recipe) {
      return (
        <Box flexDirection="column">
          <Text color="red">❌ Error: Recipe parameter is required</Text>
        </Box>
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
        return <ApplyDisplay result={result as ApplyRecipeResult} />;
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
      return <ApplyDisplay result={result as ApplyRecipeResult} />;
    }

    const applyOptions: ApplyOptions = {
      recipe: options.recipe,
      variant: options.variant,
      project: options.project,
      yes: options.yes,
      progress: options.progress,
    };

    return (
      <ApplyProgress
        options={applyOptions}
        onComplete={(applyResult) => {
          setResult(applyResult);
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
