import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { AnalysisProgress } from './AnalysisProgress';
import { InitProgress } from './InitProgress';
import { performAnalysis } from '../commands/analyze';
import { performInit } from '../commands/init';

interface ShellProps {
  command: 'analyze' | 'init';
  options: {
    progress?: boolean;
    reset?: boolean;
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

    if (command === 'init' && options.progress === false && !isComplete && !error) {
      const runSimpleInit = async () => {
        try {
          await performInit({ reset: options.reset }, (step) => {
            setSimpleStep(step);
          });
          setIsComplete(true);
        } catch (err) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      };
      runSimpleInit();
    }
  }, [command, options.progress, options.reset, isComplete, error]);

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

  if (command === 'init') {
    if (options.progress === false) {
      if (error) {
        return (
          <Box flexDirection="column">
            <Text color="red">❌ Error: {error.message}</Text>
          </Box>
        );
      }

      if (isComplete) {
        return (
          <Box flexDirection="column">
            <Text color="green">✅ Initialization complete!</Text>
          </Box>
        );
      }

      return (
        <Box flexDirection="column">
          <Text color="blue">🔧 {simpleStep || 'Initializing workspace...'}</Text>
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

    if (isComplete) {
      return (
        <Box flexDirection="column">
          <Text color="green">✅ Initialization complete!</Text>
        </Box>
      );
    }

    return (
      <InitProgress
        options={{ reset: options.reset }}
        onComplete={() => {
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