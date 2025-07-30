import React, { useEffect } from 'react';

import { InitError, performInit } from '~/commands/init';

import { useFlowStep } from './CommandFlowProgress';

interface InitAuthStepProps {
  options: {
    reset?: boolean;
    noAnalyze?: boolean;
    yes?: boolean;
    progress?: boolean;
    cost?: boolean;
  };
  onAuthRequired: () => void;
}

export const InitAuthStep: React.FC<InitAuthStepProps> = ({
  options,
  onAuthRequired,
}) => {
  const { complete, error } = useFlowStep();

  useEffect(() => {
    const runInit = async () => {
      try {
        await performInit(options);
        complete();
      } catch (err) {
        if (err instanceof InitError && err.code === 'AUTH_REQUIRED') {
          error('AUTH_REQUIRED');
          onAuthRequired();
        } else {
          const errorMsg = err instanceof Error ? err.message : String(err);
          error(errorMsg);
        }
      }
    };

    runInit();
  }, [options, complete, error, onAuthRequired]);

  return null;
};
