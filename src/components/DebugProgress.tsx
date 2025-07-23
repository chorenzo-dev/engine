import React, { useState, useEffect } from 'react';
import { Text, Box } from 'ink';
import { performRecipesApply } from '../commands/recipes';
import { ApplyOptions, ApplyRecipeResult } from '../types/apply';
import { ApplyDisplay } from './ApplyDisplay';
import { useCodeChangesProgress } from './CodeChangesProgress';
import { generateOperationId } from '../utils/code-changes-events.utils';

interface DebugProgressProps {
  options: ApplyOptions;
  onComplete: (result: ApplyRecipeResult) => void;
  onError: (error: Error) => void;
}

interface ProgressMessage {
  timestamp: string;
  type: 'step' | 'success' | 'error' | 'warning';
  message: string;
}

export const DebugProgress: React.FC<DebugProgressProps> = ({
  options,
  onComplete,
  onError,
}) => {
  const [messages, setMessages] = useState<ProgressMessage[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [result, setResult] = useState<ApplyRecipeResult | null>(null);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const [hasStarted, setHasStarted] = useState(false);

  const {
    startOperation,
    progressOperation,
    completeOperation,
    errorOperation,
    updateOperation,
  } = useCodeChangesProgress();

  const addMessage = (type: ProgressMessage['type'], message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setMessages((prev) => [...prev, { timestamp, type, message }]);
  };

  useEffect(() => {
    if (hasStarted) return;

    const runApply = async () => {
      setHasStarted(true);
      const operationId = generateOperationId('apply');

      try {
        addMessage('step', 'Starting recipe application...');

        startOperation({
          id: operationId,
          type: 'apply',
          description: 'Applying recipe',
          status: 'in_progress',
        });

        const applyResult = await performRecipesApply(
          options,
          (step, isThinking) => {
            if (step) {
              addMessage('step', step);
              progressOperation(operationId, step);
            }
            if (isThinking !== undefined) {
              updateOperation(operationId, { isThinking });
            }
          },
          (type, message) => {
            if (type === 'success' || type === 'error' || type === 'warning') {
              addMessage(type, message);
              setValidationMessages((prev) => [
                ...prev.slice(-4),
                `${getIcon(type)} ${message}`,
              ]);
            }
          }
        );

        completeOperation(operationId, {
          costUsd: applyResult.metadata?.costUsd || 0,
          turns: applyResult.metadata?.turns || 0,
          durationSeconds: applyResult.metadata?.durationSeconds || 0,
        });

        setIsComplete(true);
        setResult(applyResult);
        addMessage(
          'success',
          `Recipe applied successfully! (${applyResult.summary.successfulProjects}/${applyResult.summary.totalProjects} projects)`
        );
        onComplete(applyResult);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        errorOperation(operationId, errorMessage);
        addMessage('error', `Recipe application failed: ${errorMessage}`);
        onError(err instanceof Error ? err : new Error(errorMessage));
      }
    };

    runApply();
  }, [hasStarted]);

  const getIcon = (type: ProgressMessage['type']) => {
    switch (type) {
      case 'step':
        return '🔧';
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

  const getColor = (type: ProgressMessage['type']) => {
    switch (type) {
      case 'step':
        return 'blue';
      case 'success':
        return 'green';
      case 'error':
        return 'red';
      case 'warning':
        return 'yellow';
      default:
        return 'gray';
    }
  };

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Debug Mode - All Progress Messages:</Text>
      </Box>
      {messages.map((msg, i) => (
        <Box key={i} marginBottom={0}>
          <Text dimColor>[{msg.timestamp}] </Text>
          <Text color={getColor(msg.type)}>
            {getIcon(msg.type)} {msg.message}
          </Text>
        </Box>
      ))}
      {validationMessages.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {validationMessages.map((msg, i) => (
            <Text key={i} dimColor>
              {msg}
            </Text>
          ))}
        </Box>
      )}
      {isComplete && result && (
        <Box flexDirection="column" marginTop={2}>
          <Text bold color="blue">
            ═══════════════════════ OPERATION COMPLETE ═══════════════════════
          </Text>
          <Box marginTop={1}>
            <ApplyDisplay result={result} showCost={options.cost} />
          </Box>
        </Box>
      )}
    </Box>
  );
};
