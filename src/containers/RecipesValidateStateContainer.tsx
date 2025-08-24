import React, { useEffect } from 'react';

import {
  RecipesValidateStateOptions,
  recipesValidateState,
} from '~/commands/recipes.validate-state';
import { Step, StepContext, StepSequence } from '~/components/StepSequence';
import { extractErrorMessage } from '~/utils/error.utils';

interface RecipesValidateStateContainerProps {
  options: RecipesValidateStateOptions;
  onError: (error: Error) => void;
}

export const RecipesValidateStateContainer: React.FC<
  RecipesValidateStateContainerProps
> = ({ options, onError }) => {
  const steps: Step[] = [
    {
      id: 'validation',
      title: 'Validating recipe state',
      component: (context: StepContext) => {
        useEffect(() => {
          const runValidation = async () => {
            context.setProcessing(true);
            try {
              await recipesValidateState(options, (message) => {
                context.setActivity(message);
              });
              context.complete();
            } catch (error) {
              const errorMessage = extractErrorMessage(error);
              context.setError(errorMessage);
              process.exitCode = 1;
              onError(error instanceof Error ? error : new Error(errorMessage));
            }
          };

          runValidation();
        }, [context]);

        return null;
      },
    },
  ];

  return <StepSequence steps={steps} debugMode={options.debug} />;
};
