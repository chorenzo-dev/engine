import React, { useEffect } from 'react';

import { AnalysisResult, performAnalysis } from '~/commands/analyze';
import { AnalysisResultDisplay } from '~/components/AnalysisResultDisplay';
import { Step, StepContext, StepSequence } from '~/components/StepSequence';
import { BaseContainerOptions } from '~/types/common';

type AnalyzeContainerOptions = BaseContainerOptions;

interface AnalyzeContainerProps {
  options: AnalyzeContainerOptions;
  onError: (error: Error) => void;
}

export const AnalyzeContainer: React.FC<AnalyzeContainerProps> = ({
  options,
  onError,
}) => {
  const steps: Step[] = [
    {
      id: 'analysis',
      title: 'Running analysis',
      component: (context: StepContext) => {
        useEffect(() => {
          const runAnalysis = async () => {
            context.setProcessing(true);
            let lastActivity = '';
            try {
              const result = await performAnalysis((step, isThinking) => {
                if (step) {
                  lastActivity = step;
                  context.setActivity(step, isThinking);
                } else if (isThinking !== undefined && lastActivity) {
                  context.setActivity(lastActivity, isThinking);
                }
              });

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

          runAnalysis();
        }, []);

        return null;
      },
    },
  ];

  return (
    <StepSequence
      steps={steps}
      debugMode={options.debug}
      completionTitle="Process completed!"
      completionComponent={(context: StepContext) => {
        const result = context.getResult<AnalysisResult>('analysis');
        if (result?.analysis) {
          return (
            <AnalysisResultDisplay result={result} showCost={options.cost} />
          );
        }
        return null;
      }}
      errorTitle="Analysis failed!"
      options={options}
    />
  );
};
