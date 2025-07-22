import React, { useState, useEffect } from 'react';
import { Text, Box } from 'ink';
import { performAnalysis } from '../commands/analyze';
import { CodeChangesProgress, useCodeChangesProgress } from './CodeChangesProgress';
import { generateOperationId } from '../utils/code-changes-events.utils';

interface AnalysisProgressProps {
  onComplete: (result: any) => void;
  onError: (error: Error) => void;
}

export const AnalysisProgress: React.FC<AnalysisProgressProps> = ({
  onComplete,
  onError,
}) => {
  const {
    operations,
    startOperation,
    progressOperation,
    completeOperation,
    errorOperation,
  } = useCodeChangesProgress();

  useEffect(() => {
    const runAnalysis = async () => {
      const operationId = generateOperationId('analysis');
      
      try {
        startOperation({
          id: operationId,
          type: 'analysis',
          description: 'Initializing workspace analysis...',
          status: 'in_progress',
        });

        const result = await performAnalysis((step) => {
          progressOperation(operationId, step);
        });

        completeOperation(operationId, {
          costUsd: result.metadata?.costUsd || 0,
          turns: result.metadata?.turns || 0,
          durationSeconds: result.metadata?.durationSeconds || 0,
        });
        
        onComplete(result);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        errorOperation(operationId, errorMessage);
        onError(err instanceof Error ? err : new Error(errorMessage));
      }
    };

    runAnalysis();
  }, [onComplete, onError, startOperation, progressOperation, completeOperation, errorOperation]);

  return <CodeChangesProgress operations={operations} showLogs />;
};
