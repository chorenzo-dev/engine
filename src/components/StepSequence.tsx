import { Box, Text } from 'ink';
import React, { useState } from 'react';

import { ProgressContext } from '~/contexts/ProgressContext';
import { Logger } from '~/utils/logger.utils';

import { StepDisplay } from './StepDisplay';

export interface ProgressControls {
  setActivity: (activity: string, isProcessing?: boolean) => void;
  setError: (error: string) => void;
  complete: () => void;
  setProcessing: (processing: boolean) => void;
  setTitleVisible: (visible: boolean) => void;
}

export interface StepContext extends ProgressControls {
  setResult: (result: unknown) => void;
  getResult: <T = unknown>(stepId: string) => T;
  options: Record<string, unknown>;
}

export interface Step {
  id: string;
  title: string;
  component: (context: StepContext) => React.ReactNode;
}

interface StepSequenceProps {
  steps: Step[];
  completionTitle?: string;
  completionComponent?: (context: StepContext) => React.ReactNode;
  errorTitle?: string;
  errorComponent?: (error: Error) => React.ReactNode;
  onComplete?: () => void;
  options?: Record<string, unknown>;
}

const StepRenderer: React.FC<{
  step: Step;
  context: StepContext;
}> = ({ step, context }) => {
  return step.component(context);
};

export const StepSequence: React.FC<StepSequenceProps> = ({
  steps,
  completionTitle = 'Process completed!',
  completionComponent,
  errorTitle = 'Process failed!',
  errorComponent,
  onComplete,
  options = {},
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [errorSteps, setErrorSteps] = useState<Set<string>>(new Set());
  const [currentActivity, setCurrentActivity] = useState('');
  const [currentError, setCurrentError] = useState('');
  const [isFlowComplete, setIsFlowComplete] = useState(false);
  const [isStepProcessing, setIsStepProcessing] = useState(false);
  const [isActivityProcessing, setIsActivityProcessing] = useState(false);
  const [isTitleVisible, setIsTitleVisible] = useState(true);
  const [flowError, setFlowError] = useState<Error | null>(null);
  const [results, setResults] = useState<Record<string, unknown>>({});

  const currentStep = steps[currentStepIndex];

  const progressControls: ProgressControls = {
    setActivity: (activity: string, processing = false) => {
      Logger.info(
        { event: 'setActivity_debug', activity, processing },
        `setActivity called: ${activity} (processing: ${processing})`
      );
      setCurrentActivity(activity);
      setIsActivityProcessing(processing);
    },
    setError: (error: string) => {
      setCurrentError(error);
      setErrorSteps((prev) => new Set(prev).add(currentStep.id));
      setFlowError(new Error(error));
    },
    complete: () => {
      setCompletedSteps((prev) => new Set(prev).add(currentStep.id));
      setCurrentActivity('');
      setCurrentError('');
      setIsStepProcessing(false);
      setIsActivityProcessing(false);
      setIsTitleVisible(true);

      if (currentStepIndex < steps.length - 1) {
        setCurrentStepIndex((prev) => prev + 1);
      } else {
        setIsFlowComplete(true);
        onComplete?.();
      }
    },
    setProcessing: (processing: boolean) => {
      setIsStepProcessing(processing);
    },
    setTitleVisible: (visible: boolean) => {
      setIsTitleVisible(visible);
    },
  };

  const stepContext: StepContext = {
    ...progressControls,
    setResult: (result: unknown) => {
      if (currentStep) {
        setResults((prev) => ({ ...prev, [currentStep.id]: result }));
      }
    },
    getResult: <T = unknown,>(stepId: string): T => results[stepId] as T,
    options,
  };

  if (flowError) {
    return errorComponent ? (
      errorComponent(flowError)
    ) : (
      <StepDisplay title={errorTitle} status="error">
        <Text color="red">{flowError.message}</Text>
      </StepDisplay>
    );
  }

  if (isFlowComplete) {
    return (
      <StepDisplay title={completionTitle} status="completed">
        {completionComponent && completionComponent(stepContext)}
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
              isProcessing={isCurrentStep ? isStepProcessing : undefined}
              isActivityProcessing={
                isCurrentStep ? isActivityProcessing : undefined
              }
              isTitleVisible={isCurrentStep ? isTitleVisible : true}
            >
              {isCurrentStep && (
                <StepRenderer step={step} context={stepContext} />
              )}
            </StepDisplay>
          );
        })}
      </Box>
    </ProgressContext.Provider>
  );
};
