import React from 'react';

import { AnalysisResult } from '~/commands/analyze';

import { AnalysisStep } from './AnalysisStep';
import { useFlowStep } from './CommandFlowProgress';

interface AnalysisFlowStepProps {
  options: {
    noAnalyze?: boolean;
    yes?: boolean;
    progress?: boolean;
    cost?: boolean;
  };
  onResult: (result?: AnalysisResult) => void;
}

export const AnalysisFlowStep: React.FC<AnalysisFlowStepProps> = ({
  options,
  onResult,
}) => {
  const { complete, error } = useFlowStep();

  const handleAnalysisComplete = (result?: AnalysisResult) => {
    onResult(result);
    complete(result);
  };

  const handleAnalysisError = (err: Error) => {
    error(err.message);
  };

  return (
    <AnalysisStep
      options={options}
      onAnalysisComplete={handleAnalysisComplete}
      onAnalysisError={handleAnalysisError}
    />
  );
};
