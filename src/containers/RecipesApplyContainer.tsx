import React, { useEffect, useState } from 'react';

import {
  checkRecipeReApplication,
  performRecipesApply,
} from '~/commands/recipes.apply';
import { ProcessDisplay } from '~/components/ProcessDisplay';
import { ReApplicationPrompt } from '~/components/ReApplicationPrompt';
import { RecipesApplyResultDisplay } from '~/components/RecipesApplyResultDisplay';
import { Step, StepContext, StepSequence } from '~/components/StepSequence';
import { BaseContainerOptions } from '~/types/common';
import {
  ReApplicationCheckResult,
  RecipesApplyOptions,
  RecipesApplyResult,
} from '~/types/recipes-apply';
import { extractErrorMessage } from '~/utils/error.utils';

interface RecipesApplyContainerOptions
  extends RecipesApplyOptions,
    BaseContainerOptions {}

interface RecipesApplyContainerProps {
  options: RecipesApplyContainerOptions;
  onError: (error: Error) => void;
}

export const RecipesApplyContainer: React.FC<RecipesApplyContainerProps> = ({
  options,
  onError,
}) => {
  const [userCancelled, setUserCancelled] = useState(false);

  if (!options.recipe) {
    return (
      <ProcessDisplay
        title="Error"
        status="error"
        error="Recipe parameter is required"
      />
    );
  }

  if (userCancelled) {
    return (
      <ProcessDisplay title="Recipe application cancelled" status="completed" />
    );
  }

  const steps: Step[] = [
    {
      id: 'reapplication-check',
      title: 'Checking recipe status',
      component: (context: StepContext) => {
        const [showPrompt, setShowPrompt] = useState(false);
        const [reApplicationData, setReApplicationData] = useState<{
          recipeId: string;
          reApplicationCheck: ReApplicationCheckResult;
        } | null>(null);

        useEffect(() => {
          const runCheck = async () => {
            context.setProcessing(true);
            let lastActivity = '';

            try {
              const result = await checkRecipeReApplication(
                options,
                (step, isThinking) => {
                  if (step) {
                    lastActivity = step;
                    context.setActivity(step, isThinking);
                  } else if (isThinking !== undefined && lastActivity) {
                    context.setActivity(lastActivity, isThinking);
                  }
                }
              );

              if (result.reApplicationCheck.hasAlreadyApplied && !options.yes) {
                setReApplicationData(result);
                setShowPrompt(true);
                context.setProcessing(false);
              } else {
                context.setResult(result);
                context.complete();
              }
            } catch (error) {
              context.setError(extractErrorMessage(error));
              onError(
                error instanceof Error
                  ? error
                  : new Error(extractErrorMessage(error))
              );
            }
          };

          runCheck();
        }, []);

        if (showPrompt && reApplicationData) {
          return (
            <ReApplicationPrompt
              recipeId={reApplicationData.recipeId}
              targets={reApplicationData.reApplicationCheck.targets}
              onYes={async () => {
                const updatedData = {
                  ...reApplicationData,
                  reApplicationCheck: {
                    ...reApplicationData.reApplicationCheck,
                    userConfirmedProceed: true,
                  },
                };
                context.setResult(updatedData);
                context.complete();
                setShowPrompt(false);
              }}
              onNo={async () => {
                setUserCancelled(true);
              }}
            />
          );
        }

        return null;
      },
    },
    {
      id: 'apply',
      title: 'Applying recipe',
      component: (context: StepContext) => {
        useEffect(() => {
          const runApply = async () => {
            context.setProcessing(true);
            let lastActivity = '';

            try {
              const checkResult = context.getResult<{
                recipeId: string;
                reApplicationCheck: ReApplicationCheckResult;
              }>('reapplication-check');

              const applyOptions = checkResult?.reApplicationCheck
                .userConfirmedProceed
                ? { ...options, yes: true }
                : options;

              const result = await performRecipesApply(
                applyOptions,
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
              context.setError(extractErrorMessage(error));
              onError(
                error instanceof Error
                  ? error
                  : new Error(extractErrorMessage(error))
              );
            }
          };

          runApply();
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
        const result = context.getResult<RecipesApplyResult>('apply');
        if (result) {
          return (
            <RecipesApplyResultDisplay
              result={result}
              showCost={options.cost}
            />
          );
        }
        return null;
      }}
      errorTitle="Recipe application failed!"
      options={options}
    />
  );
};
