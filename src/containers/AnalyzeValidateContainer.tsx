import React, { useEffect } from 'react';

import {
  AnalyzeValidateOptions,
  analyzeValidate,
} from '~/commands/analysis-validate';
import { Step, StepContext, StepSequence } from '~/components/StepSequence';
import { extractErrorMessage } from '~/utils/error.utils';

interface AnalyzeValidateContainerProps {
  options: AnalyzeValidateOptions;
  onError: (error: Error) => void;
}

export const AnalyzeValidateContainer: React.FC<
  AnalyzeValidateContainerProps
> = ({ options, onError }) => {
  const steps: Step[] = [
    {
      id: 'validation',
      title: 'Validating analysis file',
      component: (context: StepContext) => {
        useEffect(() => {
          const runValidation = async () => {
            context.setProcessing(true);
            try {
              await analyzeValidate(options, (message) => {
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
