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
import { Logger } from '~/utils/logger.utils';

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
            context.setProcessing(true);
            try {
              const isAuthenticated = await performAuthCheck();
              if (isAuthenticated) {
                context.complete();
              } else {
                setNeedsAuth(true);
                context.setProcessing(false);
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
            context.setProcessing(true);
            try {
              await performInit(context.options, (step) => {
                context.setActivity(step, true);
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
    {
      id: 'analysis',
      title: 'Running project analysis',
      component: (context: StepContext) => {
        const [promptShown, setPromptShown] = useState(false);

        const runAnalysis = async () => {
          setPromptShown(false);
          context.setTitleVisible(true);
          context.setProcessing(true);
          try {
            context.setActivity('Analyzing workspace...', true);
            const result = await performAnalysis((step, isThinking) => {
              Logger.info(
                { event: 'analysis_progress', step, isThinking },
                `Analysis progress: ${step} (isThinking: ${isThinking})`
              );
              if (step) {
                context.setActivity(step, isThinking);
              } else if (isThinking !== undefined) {
                context.setActivity('Analyzing workspace...', isThinking);
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
            context.setTitleVisible(false);
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
    },
  ];

  const filteredSteps = options.noAnalyze
    ? steps.filter((step) => step.id !== 'analysis')
    : steps;

  return (
    <SimpleFlowProgress
      steps={filteredSteps}
      completionTitle="Initialization complete!"
      completionComponent={(context: StepContext) => {
        if (!options.noAnalyze) {
          const analysisResult = context.getResult<AnalysisResult>('analysis');
          if (analysisResult) {
            return (
              <AnalysisResultDisplay
                result={analysisResult}
                showCost={context.options.cost as boolean}
              />
            );
          }
        }
        return null;
      }}
      errorTitle="Initialization failed!"
      options={options}
    />
  );
};
