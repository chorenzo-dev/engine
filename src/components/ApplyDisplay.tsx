import { Box, Text } from 'ink';
import React from 'react';

import { colors } from '~/styles/colors';
import { RecipesApplyResult } from '~/types/recipes-apply';

import { MetadataDisplay } from './MetadataDisplay';

interface ApplyDisplayProps {
  result: RecipesApplyResult;
  showCost?: boolean;
}

export const ApplyDisplay: React.FC<ApplyDisplayProps> = ({
  result,
  showCost,
}) => {
  const { recipe, summary, executionResults, metadata } = result;

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" marginBottom={1}>
        <Text color={colors.success} bold>
          ✅ Recipe Application Complete
        </Text>
        <Text>Recipe: {recipe.getId()}</Text>
        <Text color={colors.muted}>{recipe.getSummary()}</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Summary:</Text>
        <Text>Total projects: {summary.totalProjects}</Text>
        <Text color={colors.success}>
          Successful: {summary.successfulProjects}
        </Text>
        {summary.failedProjects > 0 && (
          <Text color={colors.error}>Failed: {summary.failedProjects}</Text>
        )}
        {summary.skippedProjects > 0 && (
          <Text color={colors.warning}>Skipped: {summary.skippedProjects}</Text>
        )}
      </Box>

      {metadata && (
        <MetadataDisplay metadata={metadata} showCost={showCost} includeLabel />
      )}

      {executionResults.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Projects Updated:</Text>
          {executionResults.map((result, i) => (
            <Text key={i}>
              {result.success ? '✅' : '❌'} {result.projectPath}
              {result.error && !result.success && (
                <Text color={colors.muted}> ({result.error})</Text>
              )}
            </Text>
          ))}
        </Box>
      )}

      {recipe.getProvides().length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Recipe Outputs:</Text>
          {recipe.getProvides().map((key, i) => (
            <Text key={i} color={colors.muted}>
              {key}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
};
