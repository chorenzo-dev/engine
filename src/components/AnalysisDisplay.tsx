import React from 'react';
import { Box, Text } from 'ink';
import { FormatAnalysis } from '../utils/formatAnalysis';
import { AnalysisResult } from '../commands/analyze';

interface AnalysisDisplayProps {
  result: AnalysisResult;
  showCost?: boolean;
}

export const AnalysisDisplay: React.FC<AnalysisDisplayProps> = ({
  result,
  showCost,
}) => {
  if (!result.analysis) {
    return (
      <Box flexDirection="column">
        <Text color="red">❌ No analysis data available</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="green">✅ Analysis complete!</Text>
      <Box marginTop={1}>
        <FormatAnalysis analysis={result.analysis} />
      </Box>
      {result.metadata && (
        <>
          {showCost && (
            <Text color="yellow">
              💰 Cost: ${result.metadata.costUsd.toFixed(4)}
            </Text>
          )}
          <Text color="cyan">🔄 Turns: {result.metadata.turns}</Text>
          <Text color="magenta">
            ⏱️ Duration: {result.metadata.durationSeconds.toFixed(1)}s
          </Text>
        </>
      )}
      {result.unrecognizedFrameworks &&
        result.unrecognizedFrameworks.length > 0 && (
          <>
            <Text color="yellow">
              ⚠️ Unrecognized frameworks:{' '}
              {result.unrecognizedFrameworks.join(', ')}
            </Text>
            <Text color="gray">
              Please consider submitting an issue at
              https://github.com/chorenzo-dev/engine/issues to add support for
              these frameworks.
            </Text>
          </>
        )}
    </Box>
  );
};
