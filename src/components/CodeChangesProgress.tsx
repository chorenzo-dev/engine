import React, { useState, useEffect, useCallback } from 'react';
import { Text, Box } from 'ink';
import Spinner from 'ink-spinner';
import { OperationMetadata } from '../types/common';

export interface CodeChangesOperation {
  id: string;
  type: 'analysis' | 'apply' | 'init' | 'validation';
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  startTime?: Date;
  endTime?: Date;
  error?: string;
  currentActivity?: string;
  isThinking?: boolean;
  metadata?: Partial<OperationMetadata>;
}

export interface CodeChangesProgressEvent {
  type: 'operation_start' | 'operation_progress' | 'operation_complete' | 'operation_error';
  operationId: string;
  message: string;
  metadata?: Partial<OperationMetadata> & { [key: string]: unknown };
}

export interface CodeChangesProgressProps {
  operations: CodeChangesOperation[];
  onOperationUpdate?: (operation: CodeChangesOperation) => void;
  showLogs?: boolean;
  maxLogEntries?: number;
}

interface LogEntry {
  timestamp: Date;
  operationId: string;
  message: string;
  level: 'info' | 'success' | 'error' | 'warning';
}

export const CodeChangesProgress: React.FC<CodeChangesProgressProps> = ({
  operations,
  showLogs = false,
}) => {
  const [logs] = useState<LogEntry[]>([]);
  const [currentOperation, setCurrentOperation] = useState<CodeChangesOperation | null>(null);

  const getCurrentOperation = useCallback(() => {
    const inProgress = operations.find(op => op.status === 'in_progress');
    const pending = operations.find(op => op.status === 'pending');
    return inProgress || pending || operations[operations.length - 1] || null;
  }, [operations]);

  useEffect(() => {
    const current = getCurrentOperation();
    setCurrentOperation(current);
  }, [getCurrentOperation]);

  const getOperationIcon = (status: CodeChangesOperation['status']) => {
    switch (status) {
      case 'pending':
        return '⏳';
      case 'in_progress':
        return '🔄';
      case 'completed':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '📋';
    }
  };

  const getOperationColor = (status: CodeChangesOperation['status']) => {
    switch (status) {
      case 'pending':
        return 'yellow';
      case 'in_progress':
        return 'blue';
      case 'completed':
        return 'green';
      case 'error':
        return 'red';
      default:
        return 'white';
    }
  };

  const getLogIcon = (level: LogEntry['level']) => {
    switch (level) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      default:
        return 'ℹ️';
    }
  };

  if (!currentOperation) {
    return (
      <Box>
        <Text color="gray">No code change operations in progress</Text>
      </Box>
    );
  }

  const hasError = currentOperation.status === 'error';
  const isComplete = currentOperation.status === 'completed';

  return (
    <Box flexDirection="column">
      <Text color={getOperationColor(currentOperation.status)}>
        {getOperationIcon(currentOperation.status)} {currentOperation.description}
      </Text>
      
      {currentOperation.status === 'in_progress' && currentOperation.currentActivity && (
        <Box flexDirection="row">
          <Box width={3}>
            {currentOperation.isThinking && <Spinner type="dots" />}
          </Box>
          <Text color="cyan">
            {currentOperation.currentActivity}
          </Text>
        </Box>
      )}
      
      {hasError && currentOperation.error && (
        <Box marginTop={1}>
          <Text color="red">{currentOperation.error}</Text>
        </Box>
      )}

      {isComplete && currentOperation.metadata && (
        <Box marginTop={1}>
          <Text color="gray">
            {currentOperation.metadata.durationSeconds && 
              `Duration: ${currentOperation.metadata.durationSeconds.toFixed(2)}s`}
            {currentOperation.metadata.costUsd && 
              ` • Cost: $${currentOperation.metadata.costUsd.toFixed(4)}`}
            {currentOperation.metadata.turns && 
              ` • Turns: ${currentOperation.metadata.turns}`}
          </Text>
        </Box>
      )}

      {showLogs && logs.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {logs.map((log, i) => (
            <Text key={i} dimColor>
              {getLogIcon(log.level)} {log.message}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
};

export const useCodeChangesProgress = () => {
  const [operations, setOperations] = useState<CodeChangesOperation[]>([]);

  const createOperation = useCallback((
    id: string,
    type: CodeChangesOperation['type'],
    description: string
  ): CodeChangesOperation => ({
    id,
    type,
    description,
    status: 'pending',
    startTime: new Date(),
  }), []);

  const updateOperation = useCallback((
    id: string,
    updates: Partial<CodeChangesOperation>
  ) => {
    setOperations(prev => 
      prev.map(op => 
        op.id === id 
          ? { ...op, ...updates, endTime: updates.status === 'completed' || updates.status === 'error' ? new Date() : op.endTime }
          : op
      )
    );
  }, []);

  const startOperation = useCallback((operation: CodeChangesOperation) => {
    setOperations(prev => [...prev, { ...operation, status: 'in_progress', startTime: new Date() }]);
  }, []);

  const completeOperation = useCallback((id: string, metadata?: CodeChangesOperation['metadata']) => {
    updateOperation(id, { 
      status: 'completed', 
      endTime: new Date(),
      metadata: metadata ? { ...metadata } : undefined
    });
  }, [updateOperation]);

  const errorOperation = useCallback((id: string, error: string) => {
    updateOperation(id, { 
      status: 'error', 
      error,
      endTime: new Date()
    });
  }, [updateOperation]);

  const progressOperation = useCallback((id: string, message: string) => {
    updateOperation(id, { currentActivity: message });
  }, [updateOperation]);

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