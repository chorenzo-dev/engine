import { Box, Text } from 'ink';
import React from 'react';

import { colors } from '~/styles/colors';
import { Recipe, RecipeDependency, RecipeLevel } from '~/types/recipe';
import { RecipesApplyDependencyValidationResult } from '~/types/recipes-apply';
import { RecipeLocationInfo } from '~/types/recipes-show';

interface RecipeDisplayComponentProps {
  recipe: Recipe;
  location: RecipeLocationInfo;
  validationResult?: RecipesApplyDependencyValidationResult;
}

export const RecipeDisplayComponent: React.FC<RecipeDisplayComponentProps> = ({
  recipe,
  location,
  validationResult,
}) => {
  const levelLabel = getLevelLabel(recipe.getLevel());
  const ecosystems = recipe.getEcosystems();
  const requires = recipe.getRequires();
  const provides = recipe.getProvides();

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={colors.info}>
          {recipe.getId()}
        </Text>
        <Text color={colors.muted}>{recipe.getCategory()}</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Summary:</Text>
        <Text>{recipe.getSummary()}</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Location:</Text>
        <Text color={colors.muted}>Local: {location.localPath}</Text>
        {location.isRemote && location.webUrl && (
          <Text color={colors.secondary}>Web: {location.webUrl}</Text>
        )}
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Configuration:</Text>
        <Text>Level: {levelLabel}</Text>
        {ecosystems.length > 0 ? (
          <>
            <Text>Ecosystems:</Text>
            {ecosystems.map((eco, index) => (
              <Text key={index} color={colors.muted}>
                - {eco.id} (default: {eco.default_variant})
              </Text>
            ))}
          </>
        ) : (
          <Text color={colors.muted}>Ecosystem-agnostic</Text>
        )}
      </Box>

      {(requires.length > 0 || provides.length > 0) && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Dependencies:</Text>
          {requires.length > 0 && (
            <>
              <Text>Requires:</Text>
              {requires.map((dep, index) => {
                const status = getDependencyStatus(dep, validationResult);
                return (
                  <Box key={index} flexDirection="row">
                    <Text color={status.color}>
                      {status.icon} {formatDependency(dep)}
                    </Text>
                    {status.message && (
                      <Box marginLeft={1}>
                        <Text color={status.color}>({status.message})</Text>
                      </Box>
                    )}
                  </Box>
                );
              })}
            </>
          )}
          {provides.length > 0 && (
            <>
              <Text>Provides:</Text>
              {provides.map((provide, index) => (
                <Text key={index} color={colors.muted}>
                  - {provide}
                </Text>
              ))}
            </>
          )}
        </Box>
      )}
    </Box>
  );
};

function getLevelLabel(level: RecipeLevel): string {
  switch (level) {
    case 'workspace-only':
      return 'Workspace only';
    case 'project-only':
      return 'Project only';
    case 'workspace-preferred':
      return 'Workspace preferred';
    default:
      return level;
  }
}

function formatDependency(dep: RecipeDependency): string {
  return `${dep.key} = ${dep.equals}`;
}

interface DependencyStatus {
  icon: string;
  color: string;
  message?: string;
}

function getDependencyStatus(
  dep: RecipeDependency,
  validationResult?: RecipesApplyDependencyValidationResult
): DependencyStatus {
  if (!validationResult) {
    return {
      icon: '-',
      color: colors.muted,
    };
  }

  const isMissing = validationResult.missing.some(
    (missing) => missing.key === dep.key && missing.equals === dep.equals
  );

  const conflict = validationResult.conflicting.find(
    (conflicting) =>
      conflicting.key === dep.key && conflicting.required === dep.equals
  );

  if (isMissing) {
    return {
      icon: '❌',
      color: colors.error,
      message: 'missing',
    };
  }

  if (conflict) {
    return {
      icon: '⚠️',
      color: colors.error,
      message: `found ${conflict.current}`,
    };
  }

  return {
    icon: '✅',
    color: colors.success,
    message: 'satisfied',
  };
}
