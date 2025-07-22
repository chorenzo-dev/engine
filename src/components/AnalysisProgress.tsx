import React, { useState, useEffect } from 'react';
import { Text, Box } from 'ink';
import { performAnalysis } from '../commands/analyze';

interface AnalysisProgressProps {
  onComplete: (result: any) => void;
  onError: (error: Error) => void;
}

export const AnalysisProgress: React.FC<AnalysisProgressProps> = ({
  onComplete,
  onError,
}) => {
  const [currentStep, setCurrentStep] = useState(
    'Initializing workspace analysis...'
  );
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const runAnalysis = async () => {
      try {
        const result = await performAnalysis((step) => {
          setCurrentStep(step);
        });

        setIsComplete(true);
        setCurrentStep('Analysis complete!');
        onComplete(result);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        setCurrentStep('Analysis failed');
        onError(err instanceof Error ? err : new Error(errorMessage));
      }
    };

    runAnalysis();
  }, [onComplete, onError]);

  if (error) {
    return (
      <Box>
        <Text color="red">
          ❌ {currentStep}: {error}
        </Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text color={isComplete ? 'green' : 'blue'}>
        {isComplete ? '✅' : '⏳'} {currentStep}
      </Text>
    </Box>
  );
};
