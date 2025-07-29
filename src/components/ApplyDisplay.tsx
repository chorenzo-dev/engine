import { Box, Text } from 'ink';
import React from 'react';

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
        <Text color="green" bold>
          ✅ Recipe Application Complete
        </Text>
        <Text>Recipe: {recipe.getId()}</Text>
        <Text dimColor>{recipe.getSummary()}</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Summary:</Text>
        <Text> • Total projects: {summary.totalProjects}</Text>
        <Text color="green"> • Successful: {summary.successfulProjects}</Text>
        {summary.failedProjects > 0 && (
          <Text color="red"> • Failed: {summary.failedProjects}</Text>
        )}
        {summary.skippedProjects > 0 && (
          <Text color="yellow"> • Skipped: {summary.skippedProjects}</Text>
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
                <Text dimColor> ({result.error})</Text>
              )}
            </Text>
          ))}
        </Box>
      )}

      {recipe.getProvides().length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Recipe Outputs:</Text>
          {recipe.getProvides().map((key, i) => (
            <Text key={i} color="gray">
              {' '}
              • {key}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
};
