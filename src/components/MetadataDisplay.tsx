import { Box, Text } from 'ink';
import React from 'react';

import { colors } from '~/styles/colors';

interface MetadataDisplayProps {
  metadata: {
    costUsd?: number;
    durationSeconds?: number;
    startTime?: string;
    endTime?: string;
    turns?: number;
  };
  showCost?: boolean;
  inline?: boolean;
  includeLabel?: boolean;
}

export const MetadataDisplay: React.FC<MetadataDisplayProps> = ({
  metadata,
  showCost = false,
  inline = false,
  includeLabel = false,
}) => {
  const items: string[] = [];

  if (metadata.durationSeconds !== undefined) {
    items.push(`Duration: ${metadata.durationSeconds.toFixed(1)}s`);
  }

  if (showCost && metadata.costUsd !== undefined) {
    items.push(`Cost: $${metadata.costUsd.toFixed(4)}`);
  }

  if (metadata.turns !== undefined) {
    items.push(`Turns: ${metadata.turns}`);
  }

  if (items.length === 0) {
    return null;
  }

  if (inline) {
    const content = items.join('  ');
    return <Text color={colors.muted}>{content}</Text>;
  }

  return (
    <Box flexDirection="column" marginBottom={includeLabel ? 1 : 0}>
      {includeLabel && <Text bold>Performance:</Text>}
      {items.map((item, index) => (
        <Text key={index}>{item}</Text>
      ))}
      {metadata.startTime && (
        <Text color={colors.muted}>
          Started: {new Date(metadata.startTime).toLocaleTimeString()}
        </Text>
      )}
      {metadata.endTime && (
        <Text color={colors.muted}>
          Finished: {new Date(metadata.endTime).toLocaleTimeString()}
        </Text>
      )}
    </Box>
  );
};
