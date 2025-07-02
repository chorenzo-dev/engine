import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { AnalysisProgress } from './AnalysisProgress';
import { performAnalysis } from '../commands/analyze';

interface ShellProps {
  command: 'analyze';
  options: {
    progress?: boolean;
  };
}

export const Shell: React.FC<ShellProps> = ({ command, options }) => {
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [simpleStep, setSimpleStep] = useState<string>('');

  useEffect(() => {
    if (command === 'analyze' && options.progress === false && !isComplete && !error) {
      const runSimpleAnalysis = async () => {
        try {
          const analysisResult = await performAnalysis((step) => {
            setSimpleStep(step);
          });
          setResult(analysisResult);
          setIsComplete(true);
        } catch (err) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      };
      runSimpleAnalysis();
    }
  }, [command, options.progress, isComplete, error]);

  if (command === 'analyze') {
    if (options.progress === false) {
      if (error) {
        return (
          <Box flexDirection="column">
            <Text color="red">❌ Error: {error.message}</Text>
          </Box>
        );
      }

      if (isComplete && result) {
        return (
          <Box flexDirection="column">
            <Text color="green">✅ Analysis complete!</Text>
            <Text>{JSON.stringify(result.analysis, null, 2)}</Text>
            {result.metadata && (
              <>
                <Text color="yellow">💰 Cost: ${result.metadata.cost_usd.toFixed(4)}</Text>
                <Text color="cyan">🔄 Turns: {result.metadata.turns}</Text>
              </>
            )}
          </Box>
        );
      }

      return (
        <Box flexDirection="column">
          <Text color="blue">🔍 {simpleStep || 'Analyzing workspace...'}</Text>
        </Box>
      );
    }

    if (error) {
      return (
        <Box flexDirection="column">
          <Text color="red">❌ Error: {error.message}</Text>
        </Box>
      );
    }

    if (isComplete && result) {
      return (
        <Box flexDirection="column">
          <Text color="green">✅ Analysis complete!</Text>
          <Text>{JSON.stringify(result.analysis, null, 2)}</Text>
          {result.metadata && (
            <>
              <Text color="yellow">💰 Cost: ${result.metadata.cost_usd.toFixed(4)}</Text>
              <Text color="cyan">🔄 Turns: {result.metadata.turns}</Text>
            </>
          )}
        </Box>
      );
    }

    return (
      <AnalysisProgress
        onComplete={(result) => {
          setResult(result);
          setIsComplete(true);
        }}
        onError={(error) => {
          setError(error);
        }}
      />
    );
  }

  return <Text>Unknown command: {command}</Text>;
};