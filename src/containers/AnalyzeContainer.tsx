import React, { useState } from 'react';

import { AnalysisResult as AnalysisResultType } from '~/commands/analyze';
import { AnalysisFlow } from '~/components/AnalysisFlow';
import { AnalysisResultDisplay } from '~/components/AnalysisResultDisplay';
import { CommandFlow } from '~/components/CommandFlow';

interface AnalyzeContainerProps {
  options: {
    progress?: boolean;
    cost?: boolean;
  };
  onError: (error: Error) => void;
}

export const AnalyzeContainer: React.FC<AnalyzeContainerProps> = ({
  options,
  onError,
}) => {
  const [result, setResult] = useState<AnalysisResultType | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('');

  const handleComplete = (analysisResult: AnalysisResultType) => {
    setResult(analysisResult);
    setIsComplete(true);
  };

  const handleError = (err: Error) => {
    setError(err);
    onError(err);
  };

  if (error) {
    return <CommandFlow title="Error" status="error" error={error.message} />;
  }

  if (isComplete && result) {
    return <AnalysisResultDisplay result={result} showCost={options.cost} />;
  }

  if (options.progress === false) {
    return (
      <>
        <CommandFlow
          title={currentStep || 'Analyzing workspace...'}
          status="in_progress"
        />
        <AnalysisFlow
          showProgress={false}
          onComplete={handleComplete}
          onError={handleError}
          onProgress={setCurrentStep}
        />
      </>
    );
  }

  return (
    <AnalysisFlow
      showProgress={true}
      onComplete={handleComplete}
      onError={handleError}
    />
  );
};
