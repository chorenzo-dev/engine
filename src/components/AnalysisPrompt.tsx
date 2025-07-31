import { Text } from 'ink';
import TextInput from 'ink-text-input';
import React, { useState } from 'react';

interface AnalysisPromptProps {
  onYes: () => Promise<void>;
  onNo: () => Promise<void>;
}

export const AnalysisPrompt: React.FC<AnalysisPromptProps> = ({
  onYes,
  onNo,
}) => {
  const [value, setValue] = useState('');

  const handleSubmit = async (inputValue: string) => {
    if (
      inputValue.toLowerCase() === 'y' ||
      inputValue.toLowerCase() === 'yes'
    ) {
      await onYes();
    } else {
      await onNo();
    }
  };

  return (
    <Text>
      Run code-base analysis now? (y/N){' '}
      <TextInput value={value} onChange={setValue} onSubmit={handleSubmit} />
    </Text>
  );
};
