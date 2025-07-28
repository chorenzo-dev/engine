import { Box, Text } from 'ink';
import React, { useEffect, useState } from 'react';

import { AnalysisResult } from '~/commands/analyze';
import { InitError, performInit } from '~/commands/init';
import { AnalysisStep } from '~/components/AnalysisStep';
import { AuthenticationStep } from '~/components/AuthenticationStep';
import { CommandFlow } from '~/components/CommandFlow';

interface InitContainerProps {
  options: {
    reset?: boolean;
    noAnalyze?: boolean;
    yes?: boolean;
    progress?: boolean;
    cost?: boolean;
  };
  onComplete: (result?: AnalysisResult) => void;
  onError: (error: Error) => void;
}

type Step =
  | 'checking_init'
  | 'authentication'
  | 'workspace_setup'
  | 'analysis'
  | 'complete'
  | 'error';

export const InitContainer: React.FC<InitContainerProps> = ({
  options,
  onComplete,
  onError,
}) => {
  const [currentStep, setCurrentStep] = useState<Step>('checking_init');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const runInit = async () => {
      try {
        await performInit(options);
        setCurrentStep('analysis');
      } catch (error) {
        if (error instanceof InitError && error.code === 'AUTH_REQUIRED') {
          setCurrentStep('authentication');
        } else {
          setError(error instanceof Error ? error.message : String(error));
          setCurrentStep('error');
        }
      }
    };

    if (currentStep === 'checking_init') {
      runInit();
    }
  }, [currentStep, options]);

  const handleAuthComplete = () => {
    setCurrentStep('checking_init');
  };

  const handleAuthError = (errorMessage: string) => {
    setError(errorMessage);
    setCurrentStep('error');
  };

  const handleQuit = () => {
    process.exit(0);
  };

  const handleAnalysisComplete = (result?: AnalysisResult) => {
    setCurrentStep('complete');
    onComplete(result);
  };

  const handleAnalysisError = (error: Error) => {
    onError(error);
  };

  if (currentStep === 'checking_init') {
    return (
      <CommandFlow
        title="Checking Claude Code authentication..."
        status="in_progress"
      />
    );
  }

  if (currentStep === 'authentication') {
    return (
      <Box flexDirection="column">
        <AuthenticationStep
          onAuthComplete={handleAuthComplete}
          onAuthError={handleAuthError}
          onQuit={handleQuit}
        />
      </Box>
    );
  }

  if (currentStep === 'analysis') {
    return (
      <CommandFlow
        title="Initialization complete!"
        status="completed"
        completedSteps={[
          {
            id: 'init',
            title: 'Initialization complete!',
            success: true,
          },
        ]}
      >
        <AnalysisStep
          options={{
            noAnalyze: options.noAnalyze,
            yes: options.yes,
            progress: options.progress,
            cost: options.cost,
          }}
          onAnalysisComplete={handleAnalysisComplete}
          onAnalysisError={handleAnalysisError}
        />
      </CommandFlow>
    );
  }

  if (currentStep === 'error') {
    return (
      <CommandFlow title="Error" status="error" error={error}>
        <Text>Please run 'chorenzo init' again to retry.</Text>
      </CommandFlow>
    );
  }

  if (currentStep === 'complete') {
    return <CommandFlow title="Initialization complete!" status="completed" />;
  }

  return null;
};
