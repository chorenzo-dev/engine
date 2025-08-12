import { Text } from 'ink';
import React from 'react';

import { BaseContainerOptions } from '~/types/common';

interface RecipesShowContainerOptions extends BaseContainerOptions {
  recipeName: string;
}

interface RecipesShowContainerProps {
  options: RecipesShowContainerOptions;
  onError: (error: Error) => void;
}

export const RecipesShowContainer: React.FC<RecipesShowContainerProps> = ({
  options,
}) => {
  return <Text>Showing recipe: {options.recipeName}</Text>;
};
