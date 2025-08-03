import { Box, Text } from 'ink';
import React, { useEffect } from 'react';

import {
  type ValidationResult,
  performRecipesValidate,
} from '~/commands/recipes';
import { ProcessDisplay } from '~/components/ProcessDisplay';
import { emojis } from '~/components/ProcessDisplay';
import { Step, StepContext, StepSequence } from '~/components/StepSequence';
import { BaseContainerOptions } from '~/types/common';

interface RecipesValidateContainerOptions extends BaseContainerOptions {
  target: string;
}

interface RecipesValidateContainerProps {
  options: RecipesValidateContainerOptions;
  onError: (error: Error) => void;
}

export const RecipesValidateContainer: React.FC<
  RecipesValidateContainerProps
> = ({ options, onError }) => {
  if (!options.target) {
    return (
      <ProcessDisplay
        title="Error"
        status="error"
        error="Target parameter is required"
      />
    );
  }

  const steps: Step[] = [
    {
      id: 'validate',
      title: 'Validating recipe',
      component: (context: StepContext) => {
        useEffect(() => {
          const runValidate = async () => {
            context.setProcessing(true);
            let lastActivity = '';

            try {
              const result = await performRecipesValidate(
                {
                  target: options.target,
                  progress: options.progress,
                },
                (step, isThinking) => {
                  if (step) {
                    lastActivity = step;
                    context.setActivity(step, isThinking);
                  } else if (isThinking !== undefined && lastActivity) {
                    context.setActivity(lastActivity, isThinking);
                  }
                }
              );

              if (result) {
                context.setResult(result);
              }
              context.complete();
            } catch (error) {
              context.setError(
                error instanceof Error ? error.message : String(error)
              );
              onError(
                error instanceof Error ? error : new Error(String(error))
              );
            }
          };

          runValidate();
        }, []);

        return null;
      },
    },
  ];

  return (
    <StepSequence
      steps={steps}
      debugMode={options.debug}
      completionComponent={(context: StepContext) => {
        const validationResult =
          context.getResult<ValidationResult>('validate');
        if (validationResult) {
          return (
            <ProcessDisplay
              title="Recipe validation complete!"
              status="completed"
            >
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
        return null;
      }}
      errorTitle="Recipe validation failed!"
      options={options}
    />
  );
};
