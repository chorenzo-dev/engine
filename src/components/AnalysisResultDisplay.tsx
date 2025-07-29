import { Box, Text } from 'ink';
import React from 'react';

import { AnalysisResult as AnalysisResultType } from '~/commands/analyze';
import { colors } from '~/styles/colors';
import { FormatAnalysis } from '~/utils/formatAnalysis';

import { CommandFlow } from './CommandFlow';

interface AnalysisResultDisplayProps {
  result: AnalysisResultType;
  showCost?: boolean;
}

export const AnalysisResultDisplay: React.FC<AnalysisResultDisplayProps> = ({
  result,
  showCost,
}) => {
  if (!result.analysis) {
    return <CommandFlow title="No analysis data available" status="error" />;
  }

  return (
    <CommandFlow title="Analysis complete!" status="completed">
      <Box flexDirection="column">
        <Box marginTop={1}>
          <FormatAnalysis analysis={result.analysis} />
        </Box>
        {result.metadata && (
          <>
            {showCost && (
              <Text>Cost: ${result.metadata.costUsd.toFixed(4)}</Text>
            )}
            <Text>Duration: {result.metadata.durationSeconds.toFixed(1)}s</Text>
          </>
        )}
        {result.unrecognizedFrameworks &&
          result.unrecognizedFrameworks.length > 0 && (
            <>
              <Text color={colors.warning}>
                Unrecognized frameworks:{' '}
                {result.unrecognizedFrameworks.join(', ')}
              </Text>
              <Text color={colors.muted}>
                Please consider submitting an issue at
                https://github.com/chorenzo-dev/engine/issues to add support for
                these frameworks.
              </Text>
            </>
          )}
      </Box>
    </CommandFlow>
  );
};
