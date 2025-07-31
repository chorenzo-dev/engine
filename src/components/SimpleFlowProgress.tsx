import { Box } from 'ink';
import React, { useState } from 'react';

import { ProgressContext } from '~/contexts/ProgressContext';

import { StepDisplay } from './StepDisplay';

export interface ProgressControls {
  setActivity: (activity: string, isThinking?: boolean) => void;
  setError: (error: string) => void;
  complete: () => void;
  execute: () => Promise<void>;
}

export interface SimpleStep {
  id: string;
  title: string;
  component?: (context: ProgressControls) => React.ReactNode;
  execute: (context: ProgressControls) => Promise<void>;
}

interface SimpleFlowProgressProps {
  steps: SimpleStep[];
  completionTitle?: string;
  completionComponent?: React.ReactNode;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export const SimpleFlowProgress: React.FC<SimpleFlowProgressProps> = ({
  steps,
  completionTitle = 'Process completed!',
  completionComponent,
  onComplete,
  onError,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [errorSteps, setErrorSteps] = useState<Set<string>>(new Set());
  const [currentActivity, setCurrentActivity] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [currentError, setCurrentError] = useState('');
  const [isFlowComplete, setIsFlowComplete] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const currentStep = steps[currentStepIndex];

  const progressControls: ProgressControls = {
    setActivity: (activity: string, thinking = false) => {
      setCurrentActivity(activity);
      setIsThinking(thinking);
    },
    setError: (error: string) => {
      setCurrentError(error);
      setErrorSteps((prev) => new Set(prev).add(currentStep.id));
    },
    complete: () => {
      setCompletedSteps((prev) => new Set(prev).add(currentStep.id));
      setCurrentActivity('');
      setIsThinking(false);
      setCurrentError('');

      if (currentStepIndex < steps.length - 1) {
        setCurrentStepIndex((prev) => prev + 1);
      } else {
        setIsFlowComplete(true);
        onComplete?.();
      }
    },
    execute: async () => {
      if (currentStep && !isExecuting) {
        setIsExecuting(true);
        try {
          await currentStep.execute(progressControls);
        } catch (error) {
          progressControls.setError(
            error instanceof Error ? error.message : String(error)
          );
          if (onError && error instanceof Error) {
            onError(error);
          }
        } finally {
          setIsExecuting(false);
        }
      }
    },
  };

  React.useEffect(() => {
    if (
      currentStep &&
      !completedSteps.has(currentStep.id) &&
      !errorSteps.has(currentStep.id) &&
      !isExecuting
    ) {
      progressControls.execute();
    }
  }, [currentStepIndex, currentStep]);

  if (isFlowComplete) {
    return (
      <StepDisplay title={completionTitle} status="completed">
        {completionComponent}
      </StepDisplay>
    );
  }

  return (
    <ProgressContext.Provider value={progressControls}>
      <Box flexDirection="column">
        {steps.map((step, index) => {
          const isCurrentStep = index === currentStepIndex;
          const isCompleted = completedSteps.has(step.id);
          const hasError = errorSteps.has(step.id);

          let status: 'pending' | 'in_progress' | 'completed' | 'error';
          if (hasError) {
            status = 'error';
          } else if (isCompleted) {
            status = 'completed';
          } else if (isCurrentStep) {
            status = 'in_progress';
          } else {
            status = 'pending';
          }

          if (status === 'pending') {
            return null;
          }

          return (
            <StepDisplay
              key={step.id}
              title={step.title}
              status={status}
              activity={isCurrentStep ? currentActivity : undefined}
              error={hasError ? currentError : undefined}
              isThinking={isCurrentStep ? isThinking : undefined}
            >
              {isCurrentStep &&
                step.component &&
                step.component(progressControls)}
            </StepDisplay>
          );
        })}
      </Box>
    </ProgressContext.Provider>
  );
};
