import { Box, Text } from 'ink';
import React, { useEffect, useState } from 'react';

import { performRecipesApply } from '~/commands/recipes';
import { colors } from '~/styles/colors';
import { RecipesApplyOptions, RecipesApplyResult } from '~/types/recipes-apply';
import { generateOperationId } from '~/utils/code-changes-events.utils';

import {
  CodeChangesProgress,
  useCodeChangesProgress,
} from './CodeChangesProgress';

interface RecipesApplyFlowProps {
  options: RecipesApplyOptions;
  showProgress?: boolean;
  onComplete: (result: RecipesApplyResult) => void;
  onError: (error: Error) => void;
  onProgress?: (step: string) => void;
}

export const RecipesApplyFlow: React.FC<RecipesApplyFlowProps> = ({
  options,
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

  const [validationMessages, setValidationMessages] = useState<string[]>([]);

  useEffect(() => {
    const runApply = async () => {
      const operationId = generateOperationId('apply');

      try {
        if (showProgress) {
          startOperation({
            id: operationId,
            type: 'apply',
            description: 'Applying recipe',
            status: 'in_progress',
          });
        }

        const result = await performRecipesApply(
          options,
          (step, isThinking) => {
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

    runApply();
  }, [
    options,
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

  if (showProgress) {
    return (
      <Box flexDirection="column">
        <CodeChangesProgress operations={operations} showLogs />
        {validationMessages.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {validationMessages.map((msg, i) => (
              <Text key={i} color={colors.muted}>
                {msg}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    );
  }

  return null;
};
