import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import React from 'react';

import { colors } from '~/styles/colors';
import { ReApplicationTarget } from '~/types/recipes-apply';

interface ReApplicationPromptProps {
  recipeId: string;
  targets: ReApplicationTarget[];
  onYes: () => Promise<void>;
  onNo: () => Promise<void>;
}

export const ReApplicationPrompt: React.FC<ReApplicationPromptProps> = ({
  recipeId,
  targets,
  onYes,
  onNo,
}) => {
  const items = [
    {
      label: 'No',
      value: 'no',
    },
    {
      label: 'Yes',
      value: 'yes',
    },
  ];

  const handleSelect = async (item: { label: string; value: string }) => {
    if (item.value === 'yes') {
      await onYes();
    } else {
      await onNo();
    }
  };

  const formatTargets = () => {
    return targets
      .map((target) => {
        if (target.level === 'workspace') {
          return '  - At workspace level';
        } else {
          return `  - At project level: ${target.path}`;
        }
      })
      .join('\n');
  };

  return (
    <Box flexDirection="column">
      <Text color={colors.warning}>
        Warning: Recipe '{recipeId}' has already been applied!
      </Text>
      <Text>Applied at:</Text>
      <Text>{formatTargets()}</Text>
      <Text>
        Re-applying may overwrite configurations or undo customizations.
      </Text>
      <Text>Do you want to proceed with re-applying this recipe?</Text>
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
