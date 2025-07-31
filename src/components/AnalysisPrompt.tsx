import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import React from 'react';

import { colors } from '~/styles/colors';

interface AnalysisPromptProps {
  onYes: () => Promise<void>;
  onNo: () => Promise<void>;
}

export const AnalysisPrompt: React.FC<AnalysisPromptProps> = ({
  onYes,
  onNo,
}) => {
  const items = [
    {
      label: 'Yes',
      value: 'yes',
    },
    {
      label: 'No',
      value: 'no',
    },
  ];

  const handleSelect = async (item: { label: string; value: string }) => {
    if (item.value === 'yes') {
      await onYes();
    } else {
      await onNo();
    }
  };

  return (
    <Box flexDirection="column">
      <Text>Run code-base analysis now?</Text>
      <SelectInput
        items={items}
        onSelect={handleSelect}
        indicatorComponent={({ isSelected }) => (
          <Text color={isSelected ? colors.progress : colors.muted}>
            {isSelected ? '❯' : ' '}
          </Text>
        )}
        itemComponent={({ isSelected, label }) => (
          <Text color={isSelected ? colors.progress : colors.default}>
            {label}
          </Text>
        )}
      />
    </Box>
  );
};
