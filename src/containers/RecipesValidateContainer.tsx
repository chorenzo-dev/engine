import { Box, Text } from 'ink';
import React, { useEffect, useState } from 'react';

import {
  type ValidationResult,
  performRecipesValidate,
} from '~/commands/recipes';
import { ProcessDisplay } from '~/components/ProcessDisplay';
import { emojis } from '~/components/ProcessDisplay';

interface RecipesValidateContainerProps {
  options: {
    target: string;
    progress?: boolean;
  };
  onError: (error: Error) => void;
}

export const RecipesValidateContainer: React.FC<
  RecipesValidateContainerProps
> = ({ options, onError }) => {
  const [error, setError] = useState<Error | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [simpleStep, setSimpleStep] = useState<string>('');
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);

  useEffect(() => {
    if (!isComplete && !error) {
      const runRecipesValidate = async () => {
        try {
          const validationResult = await performRecipesValidate(
            {
              target: options.target,
              progress: options.progress,
            },
            (step) => {
              setSimpleStep(step || '');
            }
          );

          setValidationResult(validationResult);
          setIsComplete(true);
        } catch (err) {
          const errorObj = err instanceof Error ? err : new Error(String(err));
          setError(errorObj);
          onError(errorObj);
        }
      };
      runRecipesValidate();
    }
  }, [options.target, options.progress, isComplete, error, onError]);

  if (error) {
    return (
      <ProcessDisplay title="Error" status="error" error={error.message} />
    );
  }

  if (isComplete && validationResult) {
    return (
      <ProcessDisplay title="Recipe validation complete!" status="completed">
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
      </ProcessDisplay>
    );
  }

  return (
    <ProcessDisplay
      title={simpleStep || 'Validating recipe...'}
      status="in_progress"
    />
  );
};
