import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import React from 'react';

import { colors } from '~/styles/colors';
import { icons } from '~/styles/icons';

export const emojis = {
  success: icons.success,
  error: icons.error,
  celebration: icons.celebration,
} as const;

interface CompletedStep {
  id: string;
  title: string;
  success: boolean;
}

interface ProcessDisplayProps {
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  currentActivity?: string;
  isThinking?: boolean;
  error?: string;
  completedSteps?: CompletedStep[];
  children?: React.ReactNode;
}

export const ProcessDisplay: React.FC<ProcessDisplayProps> = ({
  title,
  status,
  currentActivity,
  isThinking,
  error,
  completedSteps = [],
  children,
}) => {
  const mainIcon =
    status === 'completed'
      ? emojis.success
      : status === 'error'
        ? emojis.error
        : '';

  const mainColor =
    status === 'completed'
      ? colors.success
      : status === 'error'
        ? colors.error
        : status === 'in_progress'
          ? colors.info
          : colors.warning;

  return (
    <Box flexDirection="column">
      {completedSteps.length > 0 && (
        <>
          {completedSteps.map((step) => (
            <Text
              key={step.id}
              color={step.success ? colors.success : colors.error}
            >
              {step.success ? emojis.success : emojis.error} {step.title}
            </Text>
          ))}
        </>
      )}

      <Text color={mainColor}>
        {mainIcon ? `${mainIcon} ${title}` : `   ${title}`}
      </Text>

      {status === 'in_progress' && currentActivity && (
        <Box flexDirection="row" marginTop={1}>
          {isThinking && <Spinner type="dots" />}
          <Text color={colors.progress}>{currentActivity}</Text>
        </Box>
      )}

      {status === 'error' && error && <Text color={colors.error}>{error}</Text>}

      {children && <Box>{children}</Box>}
    </Box>
  );
};
