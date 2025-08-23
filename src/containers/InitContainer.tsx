import React, { useEffect, useState } from 'react';

import { performAuthCheck } from '~/commands/auth';
import { InitOptions, performInit } from '~/commands/init';
import { AnalysisPrompt } from '~/components/AnalysisPrompt';
import { AuthenticationStep } from '~/components/AuthenticationStep';
import { Step, StepContext, StepSequence } from '~/components/StepSequence';
import { BaseContainerOptions } from '~/types/common';
import { extractErrorMessage } from '~/utils/error.utils';

interface InitContainerOptions extends InitOptions, BaseContainerOptions {
  noAnalyze?: boolean;
  yes?: boolean;
}

interface InitContainerProps {
  options: InitContainerOptions;
  onComplete?: (shouldRunAnalysis?: boolean) => void;
}

export const InitContainer: React.FC<InitContainerProps> = ({
  options,
  onComplete,
}) => {
  const steps: Step[] = [
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
              context.setError(extractErrorMessage(error));
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
              context.setError(extractErrorMessage(error));
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

        const handleAnalysisYes = () => {
          context.complete();
          onComplete?.(true);
        };

        const handleAnalysisNo = () => {
          context.complete();
          onComplete?.(false);
        };

        useEffect(() => {
          if (context.options['yes']) {
            handleAnalysisYes();
          } else {
            setPromptShown(true);
            context.setTitleVisible(false);
          }
        }, []);

        if (context.options['yes'] || !promptShown) {
          return null;
        }

        return (
          <AnalysisPrompt onYes={handleAnalysisYes} onNo={handleAnalysisNo} />
        );
      },
    },
  ];

  const filteredSteps = options.noAnalyze
    ? steps.filter((step) => step.id !== 'analysis')
    : steps;

  return (
    <StepSequence
      steps={filteredSteps}
      completionTitle="Initialization complete!"
      completionComponent={() => {
        return null;
      }}
      errorTitle="Initialization failed!"
      options={options}
      debugMode={options.debug}
      onComplete={onComplete}
    />
  );
};
