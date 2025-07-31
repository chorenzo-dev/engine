import { Text } from 'ink';
import TextInput from 'ink-text-input';
import React, { useState } from 'react';

import { AnalysisResult, performAnalysis } from '~/commands/analyze';
import { performAuthCheck } from '~/commands/auth';
import { performInit } from '~/commands/init';
import { AnalysisResultDisplay } from '~/components/AnalysisResultDisplay';
import { AuthenticationStep } from '~/components/AuthenticationStep';
import {
  ProgressControls,
  SimpleFlowProgress,
  SimpleStep,
} from '~/components/SimpleFlowProgress';

interface InitContainerProps {
  options: {
    reset?: boolean;
    noAnalyze?: boolean;
    yes?: boolean;
    progress?: boolean;
    cost?: boolean;
  };
  onError: (error: Error) => void;
}

export const InitContainer: React.FC<InitContainerProps> = ({
  options,
  onError,
}) => {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null
  );
  const [needsAuth, setNeedsAuth] = useState(false);
  const [showAnalysisPrompt, setShowAnalysisPrompt] = useState(false);

  const steps: SimpleStep[] = [
    {
      id: 'auth',
      title: 'Checking authentication',
      component: needsAuth
        ? (context) => (
            <AuthenticationStep
              onAuthComplete={() => context.complete()}
              onAuthError={(errorMessage: string) =>
                context.setError(errorMessage)
              }
              onQuit={() => process.exit(0)}
            />
          )
        : undefined,
      execute: async (context: ProgressControls) => {
        try {
          const isAuthenticated = await performAuthCheck();

          if (!isAuthenticated) {
            setNeedsAuth(true);
          } else {
            context.complete();
          }
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          context.setError(errorMsg);
        }
      },
    },
    {
      id: 'setup',
      title: 'Setting up workspace',
      execute: async (context: ProgressControls) => {
        try {
          await performInit(options, (step) => {
            context.setActivity(step);
          });
          context.complete();
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          context.setError(errorMsg);
        }
      },
    },
  ];

  if (!options.noAnalyze) {
    steps.push({
      id: 'analysis',
      title: 'Running project analysis',
      component:
        showAnalysisPrompt && !options.yes
          ? (context) => {
              const AnalysisPrompt: React.FC = () => {
                const [value, setValue] = useState('');

                const handleSubmit = async (inputValue: string) => {
                  if (
                    inputValue.toLowerCase() === 'y' ||
                    inputValue.toLowerCase() === 'yes'
                  ) {
                    setShowAnalysisPrompt(false);
                    await context.execute();
                  } else {
                    context.complete();
                  }
                };

                return (
                  <Text>
                    Run code-base analysis now? (y/N){' '}
                    <TextInput
                      value={value}
                      onChange={setValue}
                      onSubmit={handleSubmit}
                    />
                  </Text>
                );
              };

              return <AnalysisPrompt />;
            }
          : undefined,
      execute: async (context: ProgressControls) => {
        if (!options.yes && !showAnalysisPrompt) {
          setShowAnalysisPrompt(true);
          return;
        }

        if (!options.yes && showAnalysisPrompt) {
          return;
        }

        try {
          context.setActivity('Analyzing workspace...');
          const result = await performAnalysis((step, isThinking) => {
            if (step) {
              context.setActivity(step, isThinking);
            }
          });

          if (result) {
            setAnalysisResult(result);
          }
          context.complete();
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          context.setError(errorMsg);
        }
      },
    });
  }

  return (
    <SimpleFlowProgress
      steps={steps}
      completionTitle="Initialization complete!"
      completionComponent={
        analysisResult && analysisResult.analysis ? (
          <AnalysisResultDisplay
            result={analysisResult}
            showCost={options.cost}
          />
        ) : null
      }
      onError={onError}
    />
  );
};
