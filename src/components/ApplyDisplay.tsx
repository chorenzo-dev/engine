import React from 'react';
import { Text, Box } from 'ink';
import { ApplyRecipeResult } from '../types/apply';

interface ApplyDisplayProps {
  result: ApplyRecipeResult;
}

export const ApplyDisplay: React.FC<ApplyDisplayProps> = ({ result }) => {
  const { recipe, summary, executionResults, stateUpdated, metadata } = result;

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" marginBottom={1}>
        <Text color="green" bold>✅ Recipe Application Complete</Text>
        <Text>Recipe: {recipe.getId()}</Text>
        <Text dimColor>{recipe.getSummary()}</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Summary:</Text>
        <Text>  • Total projects: {summary.totalProjects}</Text>
        <Text color="green">  • Successful: {summary.successfulProjects}</Text>
        {summary.failedProjects > 0 && (
          <Text color="red">  • Failed: {summary.failedProjects}</Text>
        )}
        {summary.skippedProjects > 0 && (
          <Text color="yellow">  • Skipped: {summary.skippedProjects}</Text>
        )}
      </Box>

      {metadata && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Performance:</Text>
          <Text>  • Duration: {metadata.durationSeconds.toFixed(1)}s</Text>
          <Text>  • Cost: ${metadata.costUsd.toFixed(4)} USD</Text>
          {metadata.startTime && <Text dimColor>  • Started: {new Date(metadata.startTime).toLocaleTimeString()}</Text>}
          {metadata.endTime && <Text dimColor>  • Finished: {new Date(metadata.endTime).toLocaleTimeString()}</Text>}
        </Box>
      )}

      {executionResults.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Projects Updated:</Text>
          {executionResults.map((result, i) => (
            <Text key={i}>
              {result.success ? '✅' : '❌'} {result.projectPath}
              {result.error && !result.success && <Text dimColor> ({result.error})</Text>}
            </Text>
          ))}
        </Box>
      )}

      {stateUpdated && (
        <Box marginTop={1}>
          <Text color="cyan">📝 State updated in .chorenzo/state.json</Text>
        </Box>
      )}

      {recipe.getProvides().length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Recipe Outputs:</Text>
          {recipe.getProvides().map((key, i) => (
            <Text key={i} color="gray">  • {key}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
};