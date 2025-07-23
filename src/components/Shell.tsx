import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { AnalysisProgress } from './AnalysisProgress';
import { InitWithAnalysis } from './InitWithAnalysis';
import { ApplyProgress } from './ApplyProgress';
import { ApplyDisplay } from './ApplyDisplay';
import { performAnalysis, AnalysisResult } from '../commands/analyze';
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

type ShellState = 
  | { command: 'analyze'; result: AnalysisResult | null }
  | { command: 'init'; result: AnalysisResult | null }
  | { command: 'recipes-validate'; result: ValidationResult | null }
  | { command: 'recipes-apply'; result: ApplyRecipeResult | null };

export const Shell: React.FC<ShellProps> = ({ command, options }) => {
  const [commandState, setCommandState] = useState<ShellState>(() => ({
    command,
    result: null,
  } as ShellState));
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
          setCommandState({ command: 'analyze', result: analysisResult });
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

          setCommandState({ command: 'recipes-apply', result: applyResult });
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

      if (isComplete && commandState.command === 'analyze' && commandState.result) {
        return <AnalysisDisplay result={commandState.result} />;
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

    if (isComplete && commandState.command === 'analyze' && commandState.result) {
      return <AnalysisDisplay result={commandState.result} />;
    }

    return (
      <AnalysisProgress
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
            {commandState.command === 'init' && commandState.result && commandState.result.analysis ? (
              <Box marginTop={1}>
                <AnalysisDisplay result={commandState.result} />
              </Box>
            ) : null}
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
            setCommandState({ command: 'init', result: result || null });
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

      if (isComplete && commandState.command === 'recipes-apply' && commandState.result) {
        return <ApplyDisplay result={commandState.result} />;
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

    if (isComplete && commandState.command === 'recipes-apply' && commandState.result) {
      return <ApplyDisplay result={commandState.result} />;
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
          setCommandState({ command: 'recipes-apply', result: applyResult });
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
