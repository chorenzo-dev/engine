import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { performInit, InitError, type InitOptions } from '../commands/init';

interface InitProgressProps {
  options: InitOptions;
  onComplete: () => void;
  onError: (error: Error) => void;
}

export const InitProgress: React.FC<InitProgressProps> = ({ options, onComplete, onError }) => {
  const [currentStep, setCurrentStep] = useState<string>('Starting initialization...');
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const runInit = async () => {
      try {
        await performInit(options, (step: string) => {
          setCurrentStep(step);
        });
        setIsComplete(true);
        onComplete();
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    };

    runInit();
  }, [options, onComplete, onError]);

  if (isComplete) {
    return (
      <Box flexDirection="column">
        <Text color="green">✅ {currentStep}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="blue">🔧 {currentStep}</Text>
    </Box>
  );
};