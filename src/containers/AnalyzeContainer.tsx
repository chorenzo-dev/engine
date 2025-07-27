import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { AnalysisProgress } from '../components/AnalysisProgress';
import { AnalysisDisplay } from '../components/AnalysisDisplay';
import { performAnalysis, AnalysisResult } from '../commands/analyze';

interface AnalyzeContainerProps {
  options: {
    progress?: boolean;
    cost?: boolean;
  };
  onComplete: (result: AnalysisResult) => void;
  onError: (error: Error) => void;
}

export const AnalyzeContainer: React.FC<AnalyzeContainerProps> = ({
  options,
  onComplete,
  onError,
}) => {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [simpleStep, setSimpleStep] = useState<string>('');

  useEffect(() => {
    if (options.progress === false && !isComplete && !error) {
      const runSimpleAnalysis = async () => {
        try {
          const analysisResult = await performAnalysis((step) => {
            setSimpleStep(step);
          });
          setResult(analysisResult);
          setIsComplete(true);
          onComplete(analysisResult);
        } catch (err) {
          const errorObj = err instanceof Error ? err : new Error(String(err));
          setError(errorObj);
          onError(errorObj);
        }
      };
      runSimpleAnalysis();
    }
  }, [options.progress, isComplete, error, onComplete, onError]);

  if (options.progress === false) {
    if (error) {
      return (
        <Box flexDirection="column">
          <Text color="red">❌ Error: {error.message}</Text>
        </Box>
      );
    }

    if (isComplete && result) {
      return <AnalysisDisplay result={result} showCost={options.cost} />;
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

  return (
    <AnalysisProgress
      onComplete={(analysisResult) => {
        setResult(analysisResult);
        setIsComplete(true);
        onComplete(analysisResult);
      }}
      onError={(error) => {
        setError(error);
        onError(error);
      }}
    />
  );
};
