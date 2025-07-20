import React from 'react';
import { Text, Box } from 'ink';
import { ApplyResult } from '../types/apply';

interface ApplyDisplayProps {
  result: ApplyResult;
}

export const ApplyDisplay: React.FC<ApplyDisplayProps> = ({ result }) => {
  const { recipe, summary, executionResults, stateUpdated } = result;

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

      {executionResults.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Projects Updated:</Text>
          {executionResults.map((result, i) => (
            <Text key={i}>
              {result.success ? '✅' : '❌'} {result.projectPath}
              {result.logPath && <Text dimColor> (log: {result.logPath})</Text>}
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