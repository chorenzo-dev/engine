import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import React from 'react';

import { colors } from '~/styles/colors';

export const emojis = {
  success: '✅',
  error: '❌',
  celebration: '🎉',
} as const;

interface CompletedStep {
  id: string;
  title: string;
  success: boolean;
}

interface CommandFlowProps {
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  currentActivity?: string;
  isThinking?: boolean;
  error?: string;
  completedSteps?: CompletedStep[];
  children?: React.ReactNode;
}

export const CommandFlow: React.FC<CommandFlowProps> = ({
  title,
  status,
  currentActivity,
  isThinking,
  error,
  completedSteps = [],
  children,
}) => {
  const getMainIcon = () => {
    switch (status) {
      case 'completed':
        return emojis.success;
      case 'error':
        return emojis.error;
      default:
        return '';
    }
  };

  const getMainColor = () => {
    switch (status) {
      case 'completed':
        return colors.success;
      case 'error':
        return colors.error;
      case 'in_progress':
        return colors.info;
      default:
        return colors.warning;
    }
  };

  return (
    <Box flexDirection="column">
      {completedSteps.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {completedSteps.map((step) => (
            <Text
              key={step.id}
              color={step.success ? colors.success : colors.error}
            >
              {step.success ? emojis.success : emojis.error} {step.title}
            </Text>
          ))}
        </Box>
      )}

      <Box flexDirection="column">
        <Text color={getMainColor()}>
          {getMainIcon()} {title}
        </Text>

        {status === 'in_progress' && currentActivity && (
          <Box flexDirection="row" marginTop={1}>
            <Box width={3}>{isThinking && <Spinner type="dots" />}</Box>
            <Text color={colors.progress}>{currentActivity}</Text>
          </Box>
        )}

        {status === 'error' && error && (
          <Box marginTop={1}>
            <Text color={colors.error}>{error}</Text>
          </Box>
        )}

        {children && <Box marginTop={1}>{children}</Box>}
      </Box>
    </Box>
  );
};
