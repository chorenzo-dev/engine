import { Box, Text } from 'ink';
import React from 'react';

import { colors } from '~/styles/colors';
import { RecipesApplyResult } from '~/types/recipes-apply';

import { CommandFlow } from './CommandFlow';

interface RecipesApplyResultDisplayProps {
  result: RecipesApplyResult;
  showCost?: boolean;
}

export const RecipesApplyResultDisplay: React.FC<
  RecipesApplyResultDisplayProps
> = ({ result, showCost }) => {
  const { recipe, summary, executionResults, metadata } = result;

  return (
    <CommandFlow title="Recipe Application Complete" status="completed">
      <Box flexDirection="column">
        <Box flexDirection="column" marginBottom={1}>
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
            <Text color={colors.warning}>
              Skipped: {summary.skippedProjects}
            </Text>
          )}
        </Box>

        {metadata && (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold>Performance:</Text>
            <Text>Duration: {metadata.durationSeconds.toFixed(1)}s</Text>
            {showCost && <Text>Cost: ${metadata.costUsd.toFixed(4)} USD</Text>}
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
    </CommandFlow>
  );
};
