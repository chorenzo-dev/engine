import React, { useEffect } from 'react';

import { AnalysisResult, performAnalysis } from '~/commands/analyze';
import { generateOperationId } from '~/utils/code-changes-events.utils';

import {
  CodeChangesProgress,
  useCodeChangesProgress,
} from './CodeChangesProgress';

interface AnalysisFlowProps {
  showProgress?: boolean;
  onComplete: (result: AnalysisResult) => void;
  onError: (error: Error) => void;
  onProgress?: (step: string) => void;
}

export const AnalysisFlow: React.FC<AnalysisFlowProps> = ({
  showProgress = true,
  onComplete,
  onError,
  onProgress,
}) => {
  const {
    operations,
    startOperation,
    progressOperation,
    completeOperation,
    errorOperation,
    updateOperation,
  } = useCodeChangesProgress();

  useEffect(() => {
    const runAnalysis = async () => {
      const operationId = generateOperationId('analysis');

      try {
        if (showProgress) {
          startOperation({
            id: operationId,
            type: 'analysis',
            description: 'Analyzing workspace',
            status: 'in_progress',
          });
        }

        const result = await performAnalysis((step, isThinking) => {
          if (showProgress) {
            if (step) {
              progressOperation(operationId, step);
            }
            if (isThinking !== undefined) {
              updateOperation(operationId, { isThinking });
            }
          } else if (step && onProgress) {
            onProgress(step);
          }
        });

        if (showProgress) {
          completeOperation(operationId, {
            costUsd: result.metadata?.costUsd || 0,
            turns: result.metadata?.turns || 0,
            durationSeconds: result.metadata?.durationSeconds || 0,
          });
        }

        onComplete(result);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        const errorObj = err instanceof Error ? err : new Error(errorMessage);

        if (showProgress) {
          errorOperation(operationId, errorMessage);
        }

        onError(errorObj);
      }
    };

    runAnalysis();
  }, [
    showProgress,
    onComplete,
    onError,
    onProgress,
    startOperation,
    progressOperation,
    completeOperation,
    errorOperation,
    updateOperation,
  ]);

  if (showProgress) {
    return <CodeChangesProgress operations={operations} showLogs />;
  }

  return null; // Container handles simple progress display
};
