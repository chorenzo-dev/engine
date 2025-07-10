import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { AnalysisProgress } from './AnalysisProgress';
import { InitWithAnalysis } from './InitWithAnalysis';
import { performAnalysis } from '../commands/analyze';
import { performInit } from '../commands/init';
import { AnalysisDisplay } from './AnalysisDisplay';

interface ShellProps {
  command: 'analyze' | 'init';
  options: {
    progress?: boolean;
    reset?: boolean;
    noAnalyze?: boolean;
    yes?: boolean;
  };
}

export const Shell: React.FC<ShellProps> = ({ command, options }) => {
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [simpleStep, setSimpleStep] = useState<string>('');

  useEffect(() => {
    if (
      command === 'analyze' &&
      options.progress === false &&
      !isComplete &&
      !error
    ) {
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

    // Removed this - we should use InitWithAnalysis component instead
  }, [command, options.progress, options.reset, options.noAnalyze, isComplete, error]);

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
        return <AnalysisDisplay result={result} />;
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
      return <AnalysisDisplay result={result} />;
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
            {result && result.analysis && (
              <Box marginTop={1}>
                <AnalysisDisplay result={result} />
              </Box>
            )}
          </Box>
        );
      }

      return (
        <InitWithAnalysis
          options={{
            reset: options.reset,
            noAnalyze: options.noAnalyze,
            yes: options.yes,
            progress: options.progress,
          }}
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
          {result && result.analysis && (
            <Box marginTop={1}>
              <AnalysisDisplay result={result} />
            </Box>
          )}
        </Box>
      );
    }

    return (
      <InitWithAnalysis
        options={{
          reset: options.reset,
          noAnalyze: options.noAnalyze,
          yes: options.yes,
          progress: options.progress,
        }}
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
