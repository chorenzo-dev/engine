import React from 'react';
import { Box, Text } from 'ink';
import { FormatAnalysis } from '../utils/formatAnalysis';
import { WorkspaceAnalysis } from '../types/analysis';

interface AnalysisDisplayProps {
  analysis: WorkspaceAnalysis;
  metadata?: {
    cost_usd: number;
    turns: number;
  };
}

export const AnalysisDisplay: React.FC<AnalysisDisplayProps> = ({ analysis, metadata }) => {
  return (
    <Box flexDirection="column">
      <Text color="green">✅ Analysis complete!</Text>
      <Box marginTop={1}>
        <FormatAnalysis analysis={analysis} />
      </Box>
      {metadata && (
        <>
          <Text color="yellow">
            💰 Cost: ${metadata.cost_usd.toFixed(4)}
          </Text>
          <Text color="cyan">🔄 Turns: {metadata.turns}</Text>
        </>
      )}
    </Box>
  );
};