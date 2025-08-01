import { Box } from 'ink';
import React, { useEffect, useState } from 'react';

import { ProgressContext } from '~/contexts/ProgressContext';
import { useDebugMessages } from '~/hooks/useDebugMessages';
import { Logger } from '~/utils/logger.utils';

import { CompletionRenderer } from './StepSequence/CompletionRenderer';
import { DebugMessagesList } from './StepSequence/DebugMessagesList';
import { ErrorRenderer } from './StepSequence/ErrorRenderer';
import { StepDisplay } from './StepSequence/StepDisplay';

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
  debugMode?: boolean;
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
  debugMode = false,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [errorSteps, setErrorSteps] = useState<Set<string>>(new Set());
  const [currentActivity, setCurrentActivity] = useState('');
  const [currentError, setCurrentError] = useState('');
  const [isStepProcessing, setIsStepProcessing] = useState(false);
  const [isActivityProcessing, setIsActivityProcessing] = useState(false);
  const [isTitleVisible, setIsTitleVisible] = useState(true);
  const [results, setResults] = useState<Record<string, unknown>>({});

  const { debugMessages, addDebugMessage } = useDebugMessages(debugMode);

  const isFlowComplete = completedSteps.size === steps.length;
  const flowError = errorSteps.size > 0 ? new Error(currentError) : null;
  const currentStep = steps[currentStepIndex];

  useEffect(() => {
    if (debugMode && currentStep && currentStepIndex === 0) {
      addDebugMessage(currentStep.id, 'activity', currentStep.title);
    }
  }, [debugMode]);

  const progressControls: ProgressControls = {
    setActivity: (activity: string, processing = false) => {
      Logger.info(
        { event: 'setActivity_debug', activity, processing },
        `setActivity called: ${activity} (processing: ${processing})`
      );

      if (debugMode && currentStep) {
        addDebugMessage(currentStep.id, 'activity', activity, processing);
      } else {
        setCurrentActivity(activity);
        setIsActivityProcessing(processing);
      }
    },
    setError: (error: string) => {
      if (debugMode && currentStep) {
        addDebugMessage(currentStep.id, 'error', error);
      }
      setCurrentError(error);
      if (currentStep) {
        setErrorSteps((prev) => new Set(prev).add(currentStep.id));
      }
    },
    complete: () => {
      if (debugMode && currentStep) {
        addDebugMessage(
          currentStep.id,
          'complete',
          `${currentStep.title} completed`
        );
      }
      if (currentStep) {
        setCompletedSteps((prev) => new Set(prev).add(currentStep.id));
      }
      setCurrentActivity('');
      setCurrentError('');
      setIsStepProcessing(false);
      setIsActivityProcessing(false);
      setIsTitleVisible(true);

      if (currentStepIndex < steps.length - 1) {
        const nextIndex = currentStepIndex + 1;
        const nextStep = steps[nextIndex];
        setCurrentStepIndex(nextIndex);

        if (debugMode && nextStep) {
          addDebugMessage(nextStep.id, 'activity', nextStep.title);
        }
      } else {
        onComplete?.();
      }
    },
    setProcessing: (processing: boolean) => {
      if (debugMode && currentStep && processing) {
        addDebugMessage(currentStep.id, 'processing', 'Started processing...');
      }
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
    return (
      <ErrorRenderer
        error={flowError}
        errorTitle={errorTitle}
        errorComponent={errorComponent}
      />
    );
  }

  if (isFlowComplete) {
    return (
      <CompletionRenderer
        debugMode={debugMode}
        debugMessages={debugMessages}
        completionTitle={completionTitle}
        completionComponent={completionComponent}
        stepContext={stepContext}
      />
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

          if (debugMode) {
            if (isCurrentStep) {
              return (
                <Box key={step.id} flexDirection="column">
                  <DebugMessagesList messages={debugMessages} />
                  <StepRenderer step={step} context={stepContext} />
                </Box>
              );
            }
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
