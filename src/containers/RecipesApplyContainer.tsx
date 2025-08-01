import React, { useEffect } from 'react';

import { performRecipesApply } from '~/commands/recipes';
import { ProcessDisplay } from '~/components/ProcessDisplay';
import { RecipesApplyResultDisplay } from '~/components/RecipesApplyResultDisplay';
import { Step, StepContext, StepSequence } from '~/components/StepSequence';
import { RecipesApplyOptions, RecipesApplyResult } from '~/types/recipes-apply';

interface RecipesApplyContainerOptions
  extends RecipesApplyOptions,
    Record<string, unknown> {
  progress?: boolean;
  debug?: boolean;
  cost?: boolean;
}

interface RecipesApplyContainerProps {
  options: RecipesApplyContainerOptions;
  onError: (error: Error) => void;
}

export const RecipesApplyContainer: React.FC<RecipesApplyContainerProps> = ({
  options,
  onError,
}) => {
  if (!options.recipe) {
    return (
      <ProcessDisplay
        title="Error"
        status="error"
        error="Recipe parameter is required"
      />
    );
  }

  const steps: Step[] = [
    {
      id: 'apply',
      title: 'Applying recipe',
      component: (context: StepContext) => {
        useEffect(() => {
          const runApply = async () => {
            context.setProcessing(true);
            let lastActivity = '';

            try {
              const result = await performRecipesApply(
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
