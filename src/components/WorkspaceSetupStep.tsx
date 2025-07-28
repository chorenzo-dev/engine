import { Box, Text } from 'ink';
import React, { useEffect, useState } from 'react';

import { performInit } from '~/commands/init';

interface WorkspaceSetupStepProps {
  options: {
    reset?: boolean;
  };
  onSetupComplete: () => void;
  onSetupError: (error: Error) => void;
}

export const WorkspaceSetupStep: React.FC<WorkspaceSetupStepProps> = ({
  options,
  onSetupComplete,
  onSetupError,
}) => {
  const [step, setStep] = useState<string>('');
  const [setupComplete, setSetupComplete] = useState(false);

  useEffect(() => {
    if (!setupComplete) {
      const runSetup = async () => {
        try {
          await performInit({ reset: options.reset }, (step) => {
            setStep(step);
          });
          setSetupComplete(true);
          onSetupComplete();
        } catch (err) {
          onSetupError(err instanceof Error ? err : new Error(String(err)));
        }
      };
      runSetup();
    }
  }, [setupComplete, options.reset, onSetupComplete, onSetupError]);

  return (
    <Box flexDirection="column">
      <Text color="blue">🔧 {step || 'Setting up workspace...'}</Text>
    </Box>
  );
};
