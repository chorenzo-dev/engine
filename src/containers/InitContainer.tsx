import React, { useState, useEffect } from 'react';
import { Box, Text, Newline } from 'ink';
import { AuthenticationStep } from '../components/AuthenticationStep';
import { WorkspaceSetupStep } from '../components/WorkspaceSetupStep';
import { AnalysisStep } from '../components/AnalysisStep';
import { loadAndSetupAuth } from '../utils/claude.utils';
import { AnalysisResult } from '../commands/analyze';

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
  | 'checking_auth'
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
  const [currentStep, setCurrentStep] = useState<Step>('checking_auth');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const isAuthenticated = await loadAndSetupAuth();
        if (isAuthenticated) {
          setCurrentStep('workspace_setup');
        } else {
          setCurrentStep('authentication');
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
        setCurrentStep('error');
      }
    };

    if (currentStep === 'checking_auth') {
      checkAuth();
    }
  }, [currentStep]);

  const handleAuthComplete = () => {
    setCurrentStep('workspace_setup');
  };

  const handleAuthError = (errorMessage: string) => {
    setError(errorMessage);
    setCurrentStep('error');
  };

  const handleQuit = () => {
    process.exit(0);
  };

  const handleSetupComplete = () => {
    setCurrentStep('analysis');
  };

  const handleSetupError = (error: Error) => {
    onError(error);
  };

  const handleAnalysisComplete = (result?: AnalysisResult) => {
    setCurrentStep('complete');
    onComplete(result);
  };

  const handleAnalysisError = (error: Error) => {
    onError(error);
  };

  if (currentStep === 'checking_auth') {
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

  if (currentStep === 'workspace_setup') {
    return (
      <Box flexDirection="column">
        <WorkspaceSetupStep
          options={{ reset: options.reset }}
          onSetupComplete={handleSetupComplete}
          onSetupError={handleSetupError}
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
        <Text color="red">{error}</Text>
        <Newline />
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
