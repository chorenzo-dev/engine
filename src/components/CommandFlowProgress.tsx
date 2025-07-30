import React, { useState } from 'react';

import { CommandFlow } from './CommandFlow';

export interface FlowStep {
  id: string;
  title: string;
  render: () => React.ReactNode;
}

interface CommandFlowProgressProps {
  steps: FlowStep[];
  onStepComplete?: (stepId: string, result?: unknown) => void;
  onStepError?: (stepId: string, error: Error) => void;
  onFlowComplete?: (
    completedSteps: Array<{ id: string; title: string; success: boolean }>
  ) => void;
  showCompletedSteps?: boolean;
}

export const CommandFlowProgress: React.FC<CommandFlowProgressProps> = ({
  steps,
  onStepComplete,
  onStepError,
  onFlowComplete,
  showCompletedSteps = true,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<
    Array<{ id: string; title: string; success: boolean }>
  >([]);
  const [currentActivity, setCurrentActivity] = useState<string>('');
  const [error, setError] = useState<string>('');

  const currentStep = steps[currentStepIndex];
  const isComplete = currentStepIndex >= steps.length;

  const nextStep = () => {
    const updatedSteps = [
      ...completedSteps,
      {
        id: `${currentStep.id}-${currentStepIndex}`,
        title: currentStep.title,
        success: true,
      },
    ];
    setCompletedSteps(updatedSteps);

    setCurrentStepIndex((prev) => prev + 1);
    setCurrentActivity('');
    setError('');

    if (currentStepIndex >= steps.length - 1) {
      onFlowComplete?.(updatedSteps);
    }
  };

  const errorStep = (errorMessage: string) => {
    setCompletedSteps((prev) => [
      ...prev,
      {
        id: `${currentStep.id}-${currentStepIndex}`,
        title: currentStep.title,
        success: false,
      },
    ]);
    setError(errorMessage);
    onStepError?.(currentStep.id, new Error(errorMessage));
  };

  const stepComplete = (result?: unknown) => {
    onStepComplete?.(currentStep.id, result);
    nextStep();
  };

  if (isComplete) {
    return null;
  }

  if (!currentStep) {
    return <CommandFlow title="No steps defined" status="pending" />;
  }

  const stepControls: FlowStepControls = {
    setActivity: setCurrentActivity,
    complete: stepComplete,
    error: errorStep,
  };

  return (
    <CommandFlow
      title={`${currentStep.title}...`}
      status={error ? 'error' : 'in_progress'}
      currentActivity={currentActivity}
      error={error}
      completedSteps={showCompletedSteps ? completedSteps : []}
    >
      <FlowStepContext.Provider value={stepControls}>
        {currentStep.render()}
      </FlowStepContext.Provider>
    </CommandFlow>
  );
};

export interface FlowStepControls {
  setActivity: (activity: string) => void;
  complete: (result?: unknown) => void;
  error: (errorMessage: string) => void;
}

export const FlowStepContext = React.createContext<FlowStepControls | null>(
  null
);

export const useFlowStep = (): FlowStepControls => {
  const context = React.useContext(FlowStepContext);
  if (!context) {
    throw new Error(
      'useFlowStep must be used within a CommandFlowProgress step'
    );
  }
  return context;
};
