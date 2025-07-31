import { createContext, useContext } from 'react';

export interface ProgressControls {
  setActivity: (activity: string) => void;
  setError: (error: string) => void;
  complete: () => void;
}

export const ProgressContext = createContext<ProgressControls | null>(null);

export const useProgress = (): ProgressControls => {
  const context = useContext(ProgressContext);
  if (!context) {
    throw new Error('useProgress must be used within a ProgressProvider');
  }
  return context;
};
