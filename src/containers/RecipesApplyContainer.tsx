import React, { useState } from 'react';

import { DebugProgress } from '~/components/DebugProgress';
import { ProcessDisplay } from '~/components/ProcessDisplay';
import { RecipesApplyFlow } from '~/components/RecipesApplyFlow';
import { RecipesApplyResultDisplay } from '~/components/RecipesApplyResultDisplay';
import { RecipesApplyOptions, RecipesApplyResult } from '~/types/recipes-apply';

interface RecipesApplyContainerProps {
  options: RecipesApplyOptions & {
    progress?: boolean;
    debug?: boolean;
  };
  onError: (error: Error) => void;
}

export const RecipesApplyContainer: React.FC<RecipesApplyContainerProps> = ({
  options,
  onError,
}) => {
  const [result, setResult] = useState<RecipesApplyResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('');

  const handleComplete = (applyResult: RecipesApplyResult) => {
    setResult(applyResult);
    setIsComplete(true);
  };

  const handleError = (err: Error) => {
    setError(err);
    onError(err);
  };

  if (!options.recipe) {
    return (
      <ProcessDisplay
        title="Error"
        status="error"
        error="Recipe parameter is required"
      />
    );
  }

  if (error) {
    return (
      <ProcessDisplay title="Error" status="error" error={error.message} />
    );
  }

  if (isComplete && result) {
    return (
      <RecipesApplyResultDisplay result={result} showCost={options.cost} />
    );
  }

  if (options.debug) {
    return (
      <DebugProgress
        options={options}
        onComplete={handleComplete}
        onError={handleError}
      />
    );
  }

  if (options.progress === false) {
    return (
      <>
        <ProcessDisplay
          title={currentStep || 'Applying recipe...'}
          status="in_progress"
        />
        <RecipesApplyFlow
          options={options}
          showProgress={false}
          onComplete={handleComplete}
          onError={handleError}
          onProgress={setCurrentStep}
        />
      </>
    );
  }

  return (
    <RecipesApplyFlow
      options={options}
      showProgress={true}
      onComplete={handleComplete}
      onError={handleError}
    />
  );
};
