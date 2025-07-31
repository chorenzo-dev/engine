import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import React from 'react';

import { colors } from '~/styles/colors';

interface StepDisplayProps {
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  activity?: string;
  error?: string;
  isThinking?: boolean;
  children?: React.ReactNode;
}

export const StepDisplay: React.FC<StepDisplayProps> = ({
  title,
  status,
  activity,
  error,
  isThinking,
  children,
}) => {
  const getIcon = () => {
    switch (status) {
      case 'completed':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '';
    }
  };

  const getColor = () => {
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

  const icon = getIcon();
  const color = getColor();
  const displayTitle = status === 'in_progress' ? `${title}...` : title;

  return (
    <Box flexDirection="column">
      <Box>
        {status === 'in_progress' ? (
          <>
            <Spinner type="dots" />
            <Text> </Text>
          </>
        ) : icon ? (
          <Text>{icon} </Text>
        ) : null}
        <Text color={color}>{displayTitle}</Text>
      </Box>

      {status === 'in_progress' && activity && (
        <Box>
          {isThinking ? (
            <>
              <Spinner type="dots" />
              <Text> </Text>
            </>
          ) : (
            <Text> </Text>
          )}
          <Text color={colors.progress}>{activity}</Text>
        </Box>
      )}

      {status === 'error' && error && (
        <Box marginTop={1}>
          <Text color={colors.error}>{error}</Text>
        </Box>
      )}

      {children}
    </Box>
  );
};
