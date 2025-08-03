import { Text } from 'ink';
import React from 'react';

import { StepDisplay } from './StepDisplay';

interface ErrorRendererProps {
  error: Error;
  errorTitle: string;
  errorComponent?: (error: Error) => React.ReactNode;
}

export const ErrorRenderer: React.FC<ErrorRendererProps> = ({
  error,
  errorTitle,
  errorComponent,
}) => {
  return errorComponent ? (
    errorComponent(error)
  ) : (
    <StepDisplay title={errorTitle} status="error">
      <Text color="red">{error.message}</Text>
    </StepDisplay>
  );
};
