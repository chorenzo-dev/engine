import React, { useState, useEffect } from 'react';
import { Text, Box } from 'ink';
import { performRecipesApply } from '../commands/recipes';
import { ApplyOptions, ApplyRecipeResult } from '../types/apply';
import { CodeChangesProgress, useCodeChangesProgress } from './CodeChangesProgress';
import { generateOperationId } from '../utils/code-changes-events.utils';

interface ApplyProgressProps {
  options: ApplyOptions;
  onComplete: (result: ApplyRecipeResult) => void;
  onError: (error: Error) => void;
}

export const ApplyProgress: React.FC<ApplyProgressProps> = ({
  options,
  onComplete,
  onError,
}) => {
  const {
    operations,
    startOperation,
    progressOperation,
    completeOperation,
    errorOperation,
    updateOperation,
  } = useCodeChangesProgress();
  
  const [validationMessages, setValidationMessages] = useState<string[]>([]);

  useEffect(() => {
    const runApply = async () => {
      const operationId = generateOperationId('apply');
      
      try {
        startOperation({
          id: operationId,
          type: 'apply',
          description: 'Applying recipe',
          status: 'in_progress',
        });

        const result = await performRecipesApply(
          options,
          (step, isThinking) => {
            if (step) {
              progressOperation(operationId, step);
            }
            if (isThinking !== undefined) {
              updateOperation(operationId, { isThinking });
            }
          },
          (type, message) => {
            if (type === 'success' || type === 'error' || type === 'warning') {
              setValidationMessages((prev) => [
                ...prev.slice(-4),
                `${getIcon(type)} ${message}`,
              ]);
            }
          }
        );

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

    runApply();
  }, [options, onComplete, onError, startOperation, progressOperation, completeOperation, errorOperation]);

  const getIcon = (type: string) => {
    switch (type) {
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

  return (
    <Box flexDirection="column">
      <CodeChangesProgress operations={operations} showLogs />
      {validationMessages.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {validationMessages.map((msg, i) => (
            <Text key={i} dimColor>
              {msg}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
};
