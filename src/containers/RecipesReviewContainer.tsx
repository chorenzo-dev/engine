import { Box, Text } from 'ink';
import React, { useEffect } from 'react';

import {
  type ReviewResult,
  performRecipesReview,
} from '~/commands/recipes.review';
import { ProcessDisplay } from '~/components/ProcessDisplay';
import { emojis } from '~/components/ProcessDisplay';
import { Step, StepContext, StepSequence } from '~/components/StepSequence';
import { BaseContainerOptions } from '~/types/common';
import { extractErrorMessage } from '~/utils/error.utils';

interface RecipesReviewContainerOptions extends BaseContainerOptions {
  target: string;
}

interface RecipesReviewContainerProps {
  options: RecipesReviewContainerOptions;
  onError: (error: Error) => void;
}

export const RecipesReviewContainer: React.FC<RecipesReviewContainerProps> = ({
  options,
  onError,
}) => {
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
      id: 'review',
      title: 'Reviewing recipe content',
      component: (context: StepContext) => {
        useEffect(() => {
          const runReview = async () => {
            context.setProcessing(true);
            let lastActivity = '';

            try {
              const result = await performRecipesReview(
                {
                  target: options.target,
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
              const errorMessage = extractErrorMessage(error);
              context.setError(errorMessage);
              onError(error instanceof Error ? error : new Error(errorMessage));
            }
          };

          runReview();
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
        const reviewResult = context.getResult<ReviewResult>('review');
        if (reviewResult) {
          return (
            <ProcessDisplay
              title="Recipe content review complete!"
              status="completed"
            >
              <Box flexDirection="column">
                {reviewResult.messages.map((msg, index) => {
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
                {reviewResult.summary && (
                  <Box marginTop={1} flexDirection="column">
                    <Text>Summary:</Text>
                    <Text>{`  Recipes passed: ${reviewResult.summary.passed}/${reviewResult.summary.total}`}</Text>
                    <Text>{`  Recipes failed: ${reviewResult.summary.failed}/${reviewResult.summary.total}`}</Text>
                    {reviewResult.summary.warnings > 0 && (
                      <Text>{`  Total warnings: ${reviewResult.summary.warnings}`}</Text>
                    )}
                  </Box>
                )}
              </Box>
            </ProcessDisplay>
          );
        }
        return null;
      }}
      errorTitle="Recipe content review failed!"
      options={options}
    />
  );
};
