import React, { useState, useEffect } from 'react';
import { Text, Box } from 'ink';
import { performRecipesApply } from '../commands/recipes';
import { ApplyOptions, ApplyRecipeResult } from '../types/apply';

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
  const [error, setError] = useState<string | null>(null);

  const addMessage = (type: ProgressMessage['type'], message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setMessages((prev) => [...prev, { timestamp, type, message }]);
  };

  useEffect(() => {
    const runApply = async () => {
      try {
        addMessage('step', 'Starting recipe application...');
        
        const result = await performRecipesApply(
          options,
          (step) => {
            addMessage('step', step);
          },
          (type, message) => {
            if (type === 'success' || type === 'error' || type === 'warning') {
              addMessage(type, message);
            }
          }
        );

        setIsComplete(true);
        addMessage(
          'success',
          `Recipe applied successfully! (${result.summary.successfulProjects}/${result.summary.totalProjects} projects)`
        );
        onComplete(result);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        addMessage('error', `Recipe application failed: ${errorMessage}`);
        onError(err instanceof Error ? err : new Error(errorMessage));
      }
    };

    runApply();
  }, [options, onComplete, onError]);

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
        <Text bold>
          Debug Mode - All Progress Messages:
        </Text>
      </Box>
      {messages.map((msg, i) => (
        <Box key={i} marginBottom={0}>
          <Text dimColor>[{msg.timestamp}] </Text>
          <Text color={getColor(msg.type)}>
            {getIcon(msg.type)} {msg.message}
          </Text>
        </Box>
      ))}
      {isComplete && (
        <Box marginTop={1}>
          <Text color="green">
            🎉 Recipe application complete!
          </Text>
        </Box>
      )}
    </Box>
  );
};