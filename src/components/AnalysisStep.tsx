import * as fs from 'fs';
import { Box, Text, useInput, useStdin } from 'ink';
import * as os from 'os';
import * as path from 'path';
import React, { useEffect, useState } from 'react';

import { AnalysisResult, performAnalysis } from '~/commands/analyze';
import { generateOperationId } from '~/utils/code-changes-events.utils';
import { readJson, writeJson } from '~/utils/json.utils';
import { Logger } from '~/utils/logger.utils';

import { AnalysisDisplay } from './AnalysisDisplay';
import {
  CodeChangesProgress,
  useCodeChangesProgress,
} from './CodeChangesProgress';

interface AnalysisStepProps {
  options: {
    noAnalyze?: boolean;
    yes?: boolean;
    progress?: boolean;
    cost?: boolean;
  };
  onAnalysisComplete: (result?: AnalysisResult) => void;
  onAnalysisError: (error: Error) => void;
}

interface LastAnalysis {
  workspace: string;
  timestamp: string;
}

interface State {
  last_checked: string;
  last_analysis?: LastAnalysis;
}

export const AnalysisStep: React.FC<AnalysisStepProps> = ({
  options,
  onAnalysisComplete,
  onAnalysisError,
}) => {
  const [phase, setPhase] = useState<'confirm' | 'analysis' | 'complete'>(
    'confirm'
  );
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null
  );
  const [analysisStartTime, setAnalysisStartTime] = useState<number>(0);
  const [showLongRunningMessage, setShowLongRunningMessage] = useState(false);
  const [analysisAborted, setAnalysisAborted] = useState(false);
  const [userResponse, setUserResponse] = useState<string>('');
  const { isRawModeSupported } = useStdin();

  const {
    operations,
    startOperation,
    progressOperation,
    completeOperation,
    errorOperation,
    updateOperation,
  } = useCodeChangesProgress();

  const shouldUseInput = options.progress !== false && isRawModeSupported;

  useInput(
    (input, key) => {
      if (phase === 'confirm') {
        if (key.return) {
          const response = userResponse.toLowerCase();
          if (response === 'y' || response === 'yes') {
            setPhase('analysis');
            setAnalysisStartTime(Date.now());
          } else {
            setPhase('complete');
            onAnalysisComplete();
          }
          setUserResponse('');
        } else if (key.backspace) {
          setUserResponse((prev) => prev.slice(0, -1));
        } else if (input) {
          setUserResponse((prev) => prev + input);
        }
      } else if (phase === 'analysis' && key.ctrl && input === 'c') {
        setAnalysisAborted(true);
        setPhase('complete');
        onAnalysisComplete();
      }
    },
    { isActive: shouldUseInput }
  );

  useEffect(() => {
    if (options.noAnalyze) {
      setPhase('complete');
      onAnalysisComplete();
    } else if (options.yes || !shouldUseInput) {
      setPhase('analysis');
      setAnalysisStartTime(Date.now());
    }
  }, [options.noAnalyze, options.yes, shouldUseInput, onAnalysisComplete]);

  useEffect(() => {
    if (phase === 'analysis' && !analysisAborted) {
      const runAnalysis = async () => {
        const operationId = generateOperationId('analysis');

        try {
          startOperation({
            id: operationId,
            type: 'analysis',
            description: 'Initializing workspace analysis...',
            status: 'in_progress',
          });

          const result = await performAnalysis((step, isThinking) => {
            if (step) {
              progressOperation(operationId, step);
            }
            if (isThinking !== undefined) {
              updateOperation(operationId, { isThinking });
            }
          });

          setAnalysisResult(result);

          completeOperation(operationId, {
            costUsd: result.metadata?.costUsd || 0,
            turns: result.metadata?.turns || 0,
            durationSeconds: result.metadata?.durationSeconds || 0,
          });

          await Promise.all([updateGitignore(), updateGlobalState()]);

          setPhase('complete');
          onAnalysisComplete(result);
        } catch (err) {
          errorOperation(
            operationId,
            err instanceof Error ? err.message : String(err)
          );
          onAnalysisError(err instanceof Error ? err : new Error(String(err)));
        }
      };
      runAnalysis();
    }
  }, [
    phase,
    analysisAborted,
    onAnalysisComplete,
    onAnalysisError,
    startOperation,
    progressOperation,
    completeOperation,
    errorOperation,
    updateOperation,
  ]);

  useEffect(() => {
    if (phase === 'analysis' && analysisStartTime > 0) {
      const timer = setTimeout(() => {
        setShowLongRunningMessage(true);
      }, 90000);
      return () => clearTimeout(timer);
    }
  }, [phase, analysisStartTime]);

  const updateGitignore = async () => {
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    let gitignoreContent = '';

    if (fs.existsSync(gitignorePath)) {
      gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    }

    if (!gitignoreContent.includes('/.chorenzo/')) {
      gitignoreContent += gitignoreContent.endsWith('\n') ? '' : '\n';
      gitignoreContent += '/.chorenzo/\n';
      fs.writeFileSync(gitignorePath, gitignoreContent);
    }
  };

  const updateGlobalState = async () => {
    const statePath = path.join(os.homedir(), '.chorenzo', 'state.json');
    let state: State = { last_checked: '1970-01-01T00:00:00Z' };

    if (fs.existsSync(statePath)) {
      try {
        state = await readJson<State>(statePath);
      } catch (error) {
        Logger.warn(
          {
            event: 'state_read_failed',
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to read existing state file, using defaults'
        );
      }
    }

    state.last_analysis = {
      workspace: path.resolve(process.cwd()),
      timestamp: new Date().toISOString(),
    };

    await writeJson(statePath, state);
  };

  if (phase === 'confirm') {
    return (
      <Box flexDirection="column">
        <Text color="blue">
          🛈 Run code-base analysis now? (y/N) {userResponse}
        </Text>
      </Box>
    );
  }

  if (phase === 'analysis') {
    return (
      <Box flexDirection="column">
        <CodeChangesProgress operations={operations} showLogs />
        {showLongRunningMessage && (
          <Text color="yellow">
            ⧗ Still working... (Ctrl-C to abort analysis and continue)
          </Text>
        )}
      </Box>
    );
  }

  if (phase === 'complete') {
    if (analysisAborted) {
      return (
        <Box flexDirection="column">
          <Text color="yellow">⚠️ Analysis aborted by user</Text>
        </Box>
      );
    }

    if (analysisResult) {
      return (
        <Box flexDirection="column">
          <AnalysisDisplay result={analysisResult} showCost={options.cost} />
        </Box>
      );
    }

    return null;
  }

  return null;
};
