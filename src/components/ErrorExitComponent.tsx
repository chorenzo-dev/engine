import { useApp } from 'ink';
import React, { useEffect } from 'react';

import { ProcessDisplay } from './ProcessDisplay';

interface ErrorExitComponentProps {
  error: Error;
  displayDuration?: number;
}

export const ErrorExitComponent: React.FC<ErrorExitComponentProps> = ({
  error,
  displayDuration = 2000,
}) => {
  const { exit } = useApp();

  useEffect(() => {
    const timer = setTimeout(() => {
      exit(error);
    }, displayDuration);

    return () => clearTimeout(timer);
  }, [exit, error, displayDuration]);

  return <ProcessDisplay title="Error" status="error" error={error.message} />;
};
