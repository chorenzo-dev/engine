import React, { useState, useEffect } from 'react';
import { Box, Text, Newline } from 'ink';
import { AuthenticationStep } from '~/components/AuthenticationStep';
import { AnalysisStep } from '~/components/AnalysisStep';
import { AnalysisResult } from '~/commands/analyze';
import { performInit, InitError } from '~/commands/init';

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
      <Box flexDirection="column">
        <Text color="blue">🔍 Checking Claude Code authentication...</Text>
      </Box>
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
      <Box flexDirection="column">
        <Text color="green">✅ Initialization complete!</Text>
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
      </Box>
    );
  }

  if (currentStep === 'error') {
    return (
      <Box flexDirection="column">
        <Text color="red">❌ Error:</Text>
        <Text color="red">
          {error}
          <Newline />
        </Text>
        <Text>Please run 'chorenzo init' again to retry.</Text>
      </Box>
    );
  }

  if (currentStep === 'complete') {
    return (
      <Box flexDirection="column">
        <Text color="green">✅ Initialization complete!</Text>
      </Box>
    );
  }

  return null;
};
