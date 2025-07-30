import { Box, Text } from 'ink';
import React, { useState } from 'react';

import { AnalysisResult } from '~/commands/analyze';
import { AnalysisFlowStep } from '~/components/AnalysisFlowStep';
import { AnalysisResultDisplay } from '~/components/AnalysisResultDisplay';
import { AuthenticationStep } from '~/components/AuthenticationStep';
import { CommandFlow } from '~/components/CommandFlow';
import {
  CommandFlowProgress,
  FlowStep,
} from '~/components/CommandFlowProgress';
import { InitAuthStep } from '~/components/InitAuthStep';

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
  const [initError, setInitError] = useState<string>('');
  const [isFlowComplete, setIsFlowComplete] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<
    Array<{ id: string; title: string; success: boolean }>
  >([]);

  const flowSteps: FlowStep[] = [
    {
      id: 'checking_auth',
      title: 'Checking authentication',
      render: () => (
        <InitAuthStep
          options={options}
          onAuthRequired={() => setNeedsAuth(true)}
        />
      ),
    },
  ];

  if (!options.noAnalyze) {
    flowSteps.push({
      id: 'analysis',
      title: 'Running project analysis',
      render: () => (
        <AnalysisFlowStep
          options={{
            noAnalyze: options.noAnalyze,
            yes: options.yes,
            progress: options.progress,
            cost: options.cost,
          }}
          onResult={(result?: AnalysisResult) => {
            if (result) {
              setAnalysisResult(result);
            }
          }}
        />
      ),
    });
  }

  const handleStepComplete = (stepId: string, result?: unknown) => {
    if (stepId === 'analysis' && result) {
      setAnalysisResult(result as AnalysisResult);
    }
  };

  const handleStepError = (stepId: string, error: Error) => {
    if (stepId === 'checking_auth' && error.message === 'AUTH_REQUIRED') {
      setNeedsAuth(true);
    } else {
      setInitError(error.message);
      onError(error);
    }
  };

  const handleFlowComplete = (
    steps: Array<{ id: string; title: string; success: boolean }>
  ) => {
    setCompletedSteps(steps);
    setIsFlowComplete(true);
  };

  if (needsAuth) {
    return (
      <Box flexDirection="column">
        <AuthenticationStep
          onAuthComplete={() => setNeedsAuth(false)}
          onAuthError={(errorMessage: string) => {
            setInitError(errorMessage);
            onError(new Error(errorMessage));
          }}
          onQuit={() => process.exit(0)}
        />
      </Box>
    );
  }

  if (initError) {
    return (
      <CommandFlow title="Error" status="error" error={initError}>
        <Text>Please run 'chorenzo init' again to retry.</Text>
      </CommandFlow>
    );
  }

  if (isFlowComplete) {
    return (
      <CommandFlow
        title="Initialization complete!"
        status="completed"
        completedSteps={completedSteps}
      >
        {analysisResult && analysisResult.analysis ? (
          <AnalysisResultDisplay
            result={analysisResult}
            showCost={options.cost}
          />
        ) : null}
      </CommandFlow>
    );
  }

  return (
    <CommandFlowProgress
      steps={flowSteps}
      onStepComplete={handleStepComplete}
      onStepError={handleStepError}
      onFlowComplete={handleFlowComplete}
    />
  );
};
