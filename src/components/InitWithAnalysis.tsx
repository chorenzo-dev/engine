import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import { performInit } from '../commands/init';
import { performAnalysis } from '../commands/analyze';
import { AnalysisDisplay } from './AnalysisDisplay';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { writeYaml } from '../utils/yaml.utils';

interface InitWithAnalysisProps {
  options: {
    reset?: boolean;
    noAnalyze?: boolean;
    yes?: boolean;
    progress?: boolean;
  };
  onComplete: (result?: any) => void;
  onError: (error: Error) => void;
}

interface LastAnalysis {
  workspace: string;
  timestamp: string;
}

interface State {
  last_checked: string;
  last_analysis?: LastAnalysis;
}

export const InitWithAnalysis: React.FC<InitWithAnalysisProps> = ({ options, onComplete, onError }) => {
  const [phase, setPhase] = useState<'init' | 'confirm' | 'analysis' | 'complete'>('init');
  const [initComplete, setInitComplete] = useState(false);
  const [step, setStep] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [analysisStartTime, setAnalysisStartTime] = useState<number>(0);
  const [showLongRunningMessage, setShowLongRunningMessage] = useState(false);
  const [analysisAborted, setAnalysisAborted] = useState(false);
  const [userResponse, setUserResponse] = useState<string>('');
  const { isRawModeSupported } = useStdin();

  const shouldUseInput = options.progress !== false && isRawModeSupported;

  useInput((input, key) => {
    if (phase === 'confirm') {
      if (key.return) {
        const response = userResponse.toLowerCase();
        if (response === 'y' || response === 'yes') {
          setPhase('analysis');
          setAnalysisStartTime(Date.now());
        } else {
          setPhase('complete');
          onComplete();
        }
        setUserResponse('');
      } else if (key.backspace) {
        setUserResponse(prev => prev.slice(0, -1));
      } else if (input) {
        setUserResponse(prev => prev + input);
      }
    } else if (phase === 'analysis' && key.ctrl && input === 'c') {
      setAnalysisAborted(true);
      setPhase('complete');
      onComplete();
    }
  }, { isActive: shouldUseInput });

  useEffect(() => {
    if (phase === 'init' && !initComplete) {
      const runInit = async () => {
        try {
          await performInit({ reset: options.reset }, (step) => {
            setStep(step);
          });
          setInitComplete(true);
          
          if (options.noAnalyze) {
            setPhase('complete');
            onComplete();
          } else if (options.yes || !shouldUseInput) {
            // Auto-proceed with analysis if yes flag is set or in non-interactive mode
            setPhase('analysis');
            setAnalysisStartTime(Date.now());
          } else {
            setPhase('confirm');
          }
        } catch (err) {
          onError(err instanceof Error ? err : new Error(String(err)));
        }
      };
      runInit();
    }
  }, [phase, initComplete, options.reset, options.noAnalyze, options.yes, shouldUseInput, onComplete, onError]);

  useEffect(() => {
    if (phase === 'analysis' && !analysisAborted) {
      const runAnalysis = async () => {
        try {
          const result = await performAnalysis((step) => {
            setStep(step);
          });
          setAnalysisResult(result);
          
          await Promise.all([
            updateGitignore(),
            updateGlobalState()
          ]);
          
          setPhase('complete');
          onComplete(result);
        } catch (err) {
          onError(err instanceof Error ? err : new Error(String(err)));
        }
      };
      runAnalysis();
    }
  }, [phase, analysisAborted, onComplete, onError]);

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
    const statePath = path.join(os.homedir(), '.chorenzo', 'state.yaml');
    let state: State = { last_checked: '1970-01-01T00:00:00Z' };
    
    if (fs.existsSync(statePath)) {
      const { readYaml } = await import('../utils/yaml.utils');
      try {
        state = await readYaml<State>(statePath);
      } catch (error) {
        console.warn('Failed to read existing state file, using defaults');
      }
    }
    
    state.last_analysis = {
      workspace: path.resolve(process.cwd()),
      timestamp: new Date().toISOString()
    };
    
    await writeYaml(statePath, state);
  };

  if (phase === 'init') {
    return (
      <Box flexDirection="column">
        <Text color="blue">🔧 {step || 'Initializing workspace...'}</Text>
      </Box>
    );
  }

  if (phase === 'confirm') {
    return (
      <Box flexDirection="column">
        <Text color="green">✅ Initialization complete!</Text>
        <Text color="blue">🛈 Run code-base analysis now? (y/N) {userResponse}</Text>
      </Box>
    );
  }

  if (phase === 'analysis') {
    return (
      <Box flexDirection="column">
        <Text color="green">✅ Initialization complete!</Text>
        <Text color="blue">🔍 Analyzing workspace...</Text>
        <Text color="gray">{step}</Text>
        {showLongRunningMessage && (
          <Text color="yellow">⧗ Still working... (Ctrl-C to abort analysis and continue)</Text>
        )}
      </Box>
    );
  }

  if (phase === 'complete') {
    if (analysisAborted) {
      return (
        <Box flexDirection="column">
          <Text color="green">✅ Initialization complete!</Text>
          <Text color="yellow">⚠️ Analysis aborted by user</Text>
        </Box>
      );
    }

    if (analysisResult) {
      return (
        <Box flexDirection="column">
          <Text color="green">✅ Initialization complete!</Text>
          <AnalysisDisplay result={analysisResult} />
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        <Text color="green">✅ Initialization complete!</Text>
      </Box>
    );
  }

  return null;
};