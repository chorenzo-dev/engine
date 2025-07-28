import React, { useCallback, useState } from 'react';

import { OperationMetadata } from '~/types/common';

import { CommandFlow } from './CommandFlow';

export interface CommandFlowOperation {
  id: string;
  type: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  currentActivity?: string;
  isThinking?: boolean;
  error?: string;
  metadata?: Partial<OperationMetadata>;
}

interface CommandFlowProgressProps {
  operations: CommandFlowOperation[];
  showCompletedSteps?: boolean;
}

export const CommandFlowProgress: React.FC<CommandFlowProgressProps> = ({
  operations,
  showCompletedSteps = true,
}) => {
  const getCurrentOperation = useCallback(() => {
    const inProgress = operations.find((op) => op.status === 'in_progress');
    const pending = operations.find((op) => op.status === 'pending');
    return inProgress || pending || operations[operations.length - 1] || null;
  }, [operations]);

  const getCompletedSteps = useCallback(() => {
    if (!showCompletedSteps) {
      return [];
    }

    return operations
      .filter((op) => op.status === 'completed' || op.status === 'error')
      .map((op) => ({
        id: op.id,
        title: op.title,
        success: op.status === 'completed',
      }));
  }, [operations, showCompletedSteps]);

  const currentOperation = getCurrentOperation();
  const completedSteps = getCompletedSteps();

  if (!currentOperation) {
    return <CommandFlow title="No operations in progress" status="pending" />;
  }

  return (
    <CommandFlow
      title={currentOperation.title}
      status={currentOperation.status}
      currentActivity={currentOperation.currentActivity}
      isThinking={currentOperation.isThinking}
      error={currentOperation.error}
      completedSteps={completedSteps}
    />
  );
};

export const useCommandFlowProgress = () => {
  const [operations, setOperations] = useState<CommandFlowOperation[]>([]);

  const createOperation = useCallback(
    (id: string, type: string, title: string): CommandFlowOperation => ({
      id,
      type,
      title,
      status: 'pending',
    }),
    []
  );

  const updateOperation = useCallback(
    (id: string, updates: Partial<CommandFlowOperation>) => {
      setOperations((prev) =>
        prev.map((op) => (op.id === id ? { ...op, ...updates } : op))
      );
    },
    []
  );

  const startOperation = useCallback((operation: CommandFlowOperation) => {
    setOperations((prev) => [...prev, { ...operation, status: 'in_progress' }]);
  }, []);

  const completeOperation = useCallback(
    (id: string, metadata?: CommandFlowOperation['metadata']) => {
      updateOperation(id, {
        status: 'completed',
        metadata,
      });
    },
    [updateOperation]
  );

  const errorOperation = useCallback(
    (id: string, error: string) => {
      updateOperation(id, {
        status: 'error',
        error,
      });
    },
    [updateOperation]
  );

  const progressOperation = useCallback(
    (id: string, activity: string, isThinking?: boolean) => {
      updateOperation(id, {
        currentActivity: activity,
        isThinking,
      });
    },
    [updateOperation]
  );

  const clearOperations = useCallback(() => {
    setOperations([]);
  }, []);

  return {
    operations,
    createOperation,
    startOperation,
    updateOperation,
    completeOperation,
    errorOperation,
    progressOperation,
    clearOperations,
  };
};
