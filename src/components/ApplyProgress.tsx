import React, { useState, useEffect } from 'react';
import { Text, Box } from 'ink';
import { performRecipesApply } from '../commands/recipes';
import { ApplyOptions, ApplyResult } from '../types/apply';

interface ApplyProgressProps {
  options: ApplyOptions;
  onComplete: (result: ApplyResult) => void;
  onError: (error: Error) => void;
}

export const ApplyProgress: React.FC<ApplyProgressProps> = ({ options, onComplete, onError }) => {
  const [currentStep, setCurrentStep] = useState('Initializing recipe application...');
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showValidations, setShowValidations] = useState(true);

  useEffect(() => {
    const runApply = async () => {
      try {
        const result = await performRecipesApply(
          options,
          (step) => {
            setCurrentStep(step);
          },
          (type, message) => {
            if (type === 'success' || type === 'error' || type === 'warning') {
              setValidationMessages(prev => [...prev.slice(-4), `${getIcon(type)} ${message}`]);
            }
          }
        );
        
        setIsComplete(true);
        setCurrentStep(`Recipe applied successfully! (${result.summary.successfulProjects}/${result.summary.totalProjects} projects)`);
        onComplete(result);
        
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        setCurrentStep('Recipe application failed');
        onError(err instanceof Error ? err : new Error(errorMessage));
      }
    };

    runApply();
  }, [options, onComplete, onError]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      default: return 'ℹ️';
    }
  };

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">❌ {currentStep}</Text>
        <Text color="red">{error}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color={isComplete ? 'green' : 'blue'}>
        {isComplete ? '✅' : '⏳'} {currentStep}
      </Text>
      {showValidations && validationMessages.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {validationMessages.map((msg, i) => (
            <Text key={i} dimColor>{msg}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
};