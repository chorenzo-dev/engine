import { Box, Text } from 'ink';
import SelectInput, {
  type IndicatorProps,
  type ItemProps,
} from 'ink-select-input';
import React from 'react';

import { colors } from '~/styles/colors';
import { RecipesApplyDependencyValidationResult } from '~/types/recipes-apply';

interface RecipeActionsMenuProps {
  onApply: () => void;
  onExit: () => void;
  validationResult?: RecipesApplyDependencyValidationResult;
}

interface ActionItem {
  label: string;
  value: 'apply' | 'exit';
}

export const RecipeActionsMenu: React.FC<RecipeActionsMenuProps> = ({
  onApply,
  onExit,
}) => {
  const items: ActionItem[] = [
    {
      label: 'Apply Recipe',
      value: 'apply',
    },
    {
      label: 'Exit',
      value: 'exit',
    },
  ];

  const handleSelect = async (item: ActionItem) => {
    if (item.value === 'apply') {
      await onApply();
    } else {
      await onExit();
    }
  };

  return (
    <Box flexDirection="column">
      <Text>What would you like to do?</Text>
      <SelectInput
        items={items}
        onSelect={handleSelect}
        indicatorComponent={({ isSelected }: IndicatorProps) => (
          <Text color={isSelected ? colors.progress : colors.muted}>
            {isSelected ? '❯' : ' '}
          </Text>
        )}
        itemComponent={({ isSelected, label }: ItemProps) =>
          isSelected ? (
            <Text color={colors.progress}>{label}</Text>
          ) : (
            <Text>{label}</Text>
          )
        }
      />
    </Box>
  );
};
