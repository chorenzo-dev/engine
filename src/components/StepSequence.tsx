import { Box, Text } from 'ink';
import React, { useEffect, useState } from 'react';

import { ProgressContext } from '~/contexts/ProgressContext';
import { colors } from '~/styles/colors';
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
  const [isFlowComplete, setIsFlowComplete] = useState(false);
  const [isStepProcessing, setIsStepProcessing] = useState(false);
  const [isActivityProcessing, setIsActivityProcessing] = useState(false);
  const [isTitleVisible, setIsTitleVisible] = useState(true);
  const [flowError, setFlowError] = useState<Error | null>(null);
  const [results, setResults] = useState<Record<string, unknown>>({});
  const [debugMessages, setDebugMessages] = useState<
    Record<
      string,
      Array<{
        timestamp: string;
        type: 'activity' | 'error' | 'complete' | 'processing';
        message: string;
        isThinking?: boolean;
      }>
    >
  >({});

  const currentStep = steps[currentStepIndex];

  useEffect(() => {
    if (debugMode && currentStep && currentStepIndex === 0) {
      addDebugMessage(currentStep.id, 'activity', currentStep.title);
    }
  }, [debugMode]);

  const addDebugMessage = (
    stepId: string,
    type: 'activity' | 'error' | 'complete' | 'processing',
    message: string,
    isThinking?: boolean
  ) => {
    if (debugMode) {
      const timestamp = new Date().toLocaleTimeString();
      setDebugMessages((prev) => {
        const stepMessages = prev[stepId] || [];
        const lastMessage = stepMessages[stepMessages.length - 1];

        if (
          lastMessage &&
          lastMessage.message === message &&
          lastMessage.type === type
        ) {
          return prev;
        }

        return {
          ...prev,
          [stepId]: [...stepMessages, { timestamp, type, message, isThinking }],
        };
      });
    }
  };

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
      setErrorSteps((prev) => new Set(prev).add(currentStep.id));
      setFlowError(new Error(error));
    },
    complete: () => {
      if (debugMode && currentStep) {
        addDebugMessage(
          currentStep.id,
          'complete',
          `${currentStep.title} completed`
        );
      }
      setCompletedSteps((prev) => new Set(prev).add(currentStep.id));
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
        setIsFlowComplete(true);
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

  const renderDebugMessages = (messages: (typeof debugMessages)[string]) => {
    return messages.map((msg, i) => (
      <Text key={i}>
        <Text color={colors.muted}>[{msg.timestamp}]</Text>{' '}
        <Text
          color={
            msg.type === 'complete'
              ? colors.success
              : msg.type === 'processing'
                ? colors.info
                : colors.progress
          }
        >
          {msg.message}
        </Text>
      </Text>
    ));
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
    if (debugMode) {
      return (
        <Box flexDirection="column">
          {steps.map((step) => {
            const stepMessages = debugMessages[step.id] || [];
            if (stepMessages.length === 0) {
              return null;
            }

            return (
              <Box key={step.id} flexDirection="column">
                {renderDebugMessages(stepMessages)}
              </Box>
            );
          })}

          {completionComponent ? (
            <Box marginTop={1}>
              {completionComponent(stepContext) || (
                <StepDisplay title={completionTitle} status="completed" />
              )}
            </Box>
          ) : (
            <StepDisplay title={completionTitle} status="completed" />
          )}
        </Box>
      );
    }

    if (completionComponent) {
      const component = completionComponent(stepContext);
      if (component) {
        return <>{component}</>;
      }
    }
    return <StepDisplay title={completionTitle} status="completed" />;
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
            const stepMessages = debugMessages[step.id] || [];

            if (stepMessages.length === 0 && !isCurrentStep) {
              return null;
            }

            return (
              <Box key={step.id} flexDirection="column">
                {renderDebugMessages(stepMessages)}
                {isCurrentStep && (
                  <StepRenderer step={step} context={stepContext} />
                )}
              </Box>
            );
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
