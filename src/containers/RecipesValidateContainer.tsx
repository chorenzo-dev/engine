import { Box, Text } from 'ink';
import React, { useEffect, useState } from 'react';

import {
  type ValidationResult,
  performRecipesValidate,
} from '~/commands/recipes';
import { CommandFlow } from '~/components/CommandFlow';
import { emojis } from '~/components/CommandFlow';

interface RecipesValidateContainerProps {
  options: {
    target: string;
    progress?: boolean;
  };
  onComplete: (result: ValidationResult) => void;
  onError: (error: Error) => void;
}

export const RecipesValidateContainer: React.FC<
  RecipesValidateContainerProps
> = ({ options, onComplete, onError }) => {
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
          onComplete(validationResult);
        } catch (err) {
          const errorObj = err instanceof Error ? err : new Error(String(err));
          setError(errorObj);
          onError(errorObj);
        }
      };
      runRecipesValidate();
    }
  }, [
    options.target,
    options.progress,
    isComplete,
    error,
    onComplete,
    onError,
  ]);

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
};
