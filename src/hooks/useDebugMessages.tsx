import { useState } from 'react';

export interface DebugMessage {
  timestamp: string;
  type: 'activity' | 'error' | 'complete' | 'processing';
  message: string;
  stepId: string;
  isThinking?: boolean;
}

export const useDebugMessages = (debugMode: boolean) => {
  const [debugMessages, setDebugMessages] = useState<DebugMessage[]>([]);

  const addDebugMessage = (
    stepId: string,
    type: 'activity' | 'error' | 'complete' | 'processing',
    message: string,
    isThinking?: boolean
  ) => {
    if (debugMode) {
      const timestamp = new Date().toLocaleTimeString();
      setDebugMessages((prev) => {
        const lastMessage = prev[prev.length - 1];

        if (
          lastMessage &&
          lastMessage.message === message &&
          lastMessage.type === type &&
          lastMessage.stepId === stepId
        ) {
          return prev;
        }

        return [...prev, { timestamp, type, message, stepId, isThinking }];
      });
    }
  };

  return {
    debugMessages,
    addDebugMessage,
  };
};
