import { Text } from 'ink';
import React from 'react';

import { DebugMessage } from '~/hooks/useDebugMessages';
import { colors } from '~/styles/colors';

interface DebugMessagesListProps {
  messages: DebugMessage[];
}

export const DebugMessagesList: React.FC<DebugMessagesListProps> = ({
  messages,
}) => {
  return (
    <>
      {messages.map((msg, i) => (
        <Text key={i}>
          <Text color={colors.muted}>[{msg.timestamp}]</Text>{' '}
          <Text
            color={
              msg.type === 'complete'
                ? undefined
                : msg.type === 'processing'
                  ? colors.info
                  : colors.progress
            }
          >
            {msg.message}
          </Text>
        </Text>
      ))}
    </>
  );
};
