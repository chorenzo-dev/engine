import React, { useEffect, useState } from 'react';

import { AnalysisResult, performAnalysis } from '~/commands/analyze';
import { AnalysisDisplay } from '~/components/AnalysisDisplay';
import { AnalysisProgress } from '~/components/AnalysisProgress';
import { CommandFlow } from '~/components/CommandFlow';

interface AnalyzeContainerProps {
  options: {
    progress?: boolean;
    cost?: boolean;
  };
  onComplete: (result: AnalysisResult) => void;
  onError: (error: Error) => void;
}

export const AnalyzeContainer: React.FC<AnalyzeContainerProps> = ({
  options,
  onComplete,
  onError,
}) => {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [simpleStep, setSimpleStep] = useState<string>('');

  useEffect(() => {
    if (options.progress === false && !isComplete && !error) {
      const runSimpleAnalysis = async () => {
        try {
          const analysisResult = await performAnalysis((step) => {
            setSimpleStep(step || '');
          });
          setResult(analysisResult);
          setIsComplete(true);
          onComplete(analysisResult);
        } catch (err) {
          const errorObj = err instanceof Error ? err : new Error(String(err));
          setError(errorObj);
          onError(errorObj);
        }
      };
      runSimpleAnalysis();
    }
  }, [options.progress, isComplete, error, onComplete, onError]);

  if (options.progress === false) {
    if (error) {
      return <CommandFlow title="Error" status="error" error={error.message} />;
    }

    if (isComplete && result) {
      return <AnalysisDisplay result={result} showCost={options.cost} />;
    }

    return (
      <CommandFlow
        title={simpleStep || 'Analyzing workspace...'}
        status="in_progress"
      />
    );
  }

  if (error) {
    return <CommandFlow title="Error" status="error" error={error.message} />;
  }

  return (
    <AnalysisProgress
      onComplete={(analysisResult) => {
        setResult(analysisResult);
        setIsComplete(true);
        onComplete(analysisResult);
      }}
      onError={(error) => {
        setError(error);
        onError(error);
      }}
    />
  );
};
