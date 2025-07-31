import React, { useEffect, useState } from 'react';

import { AnalysisResult, performAnalysis } from '~/commands/analyze';
import { performAuthCheck } from '~/commands/auth';
import { performInit } from '~/commands/init';
import { AnalysisPrompt } from '~/components/AnalysisPrompt';
import { AnalysisResultDisplay } from '~/components/AnalysisResultDisplay';
import { AuthenticationStep } from '~/components/AuthenticationStep';
import {
  SimpleFlowProgress,
  SimpleStep,
  StepContext,
} from '~/components/SimpleFlowProgress';

interface InitContainerProps {
  options: {
    reset?: boolean;
    noAnalyze?: boolean;
    yes?: boolean;
    progress?: boolean;
    cost?: boolean;
  };
}

export const InitContainer: React.FC<InitContainerProps> = ({ options }) => {
  const steps: SimpleStep[] = [
    {
      id: 'auth',
      title: 'Checking authentication',
      component: (context: StepContext) => {
        const [needsAuth, setNeedsAuth] = useState<boolean | null>(null);

        useEffect(() => {
          const checkAuth = async () => {
            try {
              const isAuthenticated = await performAuthCheck();
              if (isAuthenticated) {
                context.complete();
              } else {
                setNeedsAuth(true);
              }
            } catch (error) {
              context.setError(
                error instanceof Error ? error.message : String(error)
              );
            }
          };

          checkAuth();
        }, []);

        if (!needsAuth) {
          return null;
        }

        return (
          <AuthenticationStep
            onAuthComplete={() => context.complete()}
            onAuthError={(errorMessage: string) =>
              context.setError(errorMessage)
            }
            onQuit={() => process.exit(0)}
          />
        );
      },
    },
    {
      id: 'setup',
      title: 'Setting up workspace',
      component: (context: StepContext) => {
        useEffect(() => {
          const setup = async () => {
            try {
              await performInit(context.options, (step) => {
                context.setActivity(step);
              });
              context.complete();
            } catch (error) {
              context.setError(
                error instanceof Error ? error.message : String(error)
              );
            }
          };

          setup();
        }, []);

        return null;
      },
    },
  ];

  if (!options.noAnalyze) {
    steps.push({
      id: 'analysis',
      title: 'Running project analysis',
      component: (context: StepContext) => {
        const [promptShown, setPromptShown] = useState(false);

        const runAnalysis = async () => {
          try {
            context.setActivity('Analyzing workspace...');
            const result = await performAnalysis((step, isThinking) => {
              if (step) {
                context.setActivity(step, isThinking);
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
          }
        };

        useEffect(() => {
          if (context.options.yes) {
            runAnalysis();
          } else {
            setPromptShown(true);
          }
        }, []);

        if (context.options.yes || !promptShown) {
          return null;
        }

        return (
          <AnalysisPrompt
            onYes={runAnalysis}
            onNo={async () => context.complete()}
          />
        );
      },
    });
  }

  return (
    <SimpleFlowProgress
      steps={steps}
      completionTitle="Initialization complete!"
      completionComponent={(context: StepContext) => {
        if (!options.noAnalyze) {
          const analysisResult = context.getResult<AnalysisResult>('analysis');
          if (!analysisResult) {
            context.setError('Analysis was expected but no result was found');
            return null;
          }
          return (
            <AnalysisResultDisplay
              result={analysisResult}
              showCost={context.options.cost as boolean}
            />
          );
        }
        return null;
      }}
      errorTitle="Initialization failed!"
      options={options}
    />
  );
};
