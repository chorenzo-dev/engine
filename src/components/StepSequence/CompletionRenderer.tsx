import { Box } from 'ink';
import React from 'react';

import { DebugMessage } from '~/hooks/useDebugMessages';

import { StepContext } from '../StepSequence';
import { DebugMessagesList } from './DebugMessagesList';
import { StepDisplay } from './StepDisplay';

interface CompletionRendererProps {
  debugMode: boolean;
  debugMessages: DebugMessage[];
  completionTitle: string;
  completionComponent?: (context: StepContext) => React.ReactNode;
  stepContext: StepContext;
}

export const CompletionRenderer: React.FC<CompletionRendererProps> = ({
  debugMode,
  debugMessages,
  completionTitle,
  completionComponent,
  stepContext,
}) => {
  if (debugMode) {
    return (
      <Box flexDirection="column">
        <DebugMessagesList messages={debugMessages} />

        {completionComponent ? (
          <Box marginTop={1}>
            {completionComponent(stepContext) || (
              <StepDisplay title={completionTitle} status="completed" />
            )}
          </Box>
        ) : (
          <StepDisplay title={completionTitle} status="completed" />
        )}
      </Box>
    );
  }

  if (completionComponent) {
    const component = completionComponent(stepContext);
    if (component) {
      return <>{component}</>;
    }
  }
  return <StepDisplay title={completionTitle} status="completed" />;
};
