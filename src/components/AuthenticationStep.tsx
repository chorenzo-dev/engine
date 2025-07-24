import React, { useState } from 'react';
import { Box, Text, Newline } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { AuthMethod, AuthConfig } from '../types/config';
import {
  validateApiKey,
  checkClaudeCodeAuth,
  saveAuthConfig,
  loadAndSetupAuth,
} from '../utils/claude.utils';

interface AuthenticationStepProps {
  onAuthComplete: () => void;
  onAuthError: (error: string) => void;
  onQuit: () => void;
}

interface SelectItem {
  label: string;
  value: AuthMethod | 'quit';
}

const authOptions: SelectItem[] = [
  {
    label: 'Install and authenticate with Claude Code (recommended)',
    value: AuthMethod.ClaudeCode,
  },
  {
    label: 'Provide Anthropic API key',
    value: AuthMethod.AnthropicApi,
  },
  {
    label: 'Configure AWS Bedrock',
    value: AuthMethod.AwsBedrock,
  },
  {
    label: 'Configure Google Vertex AI',
    value: AuthMethod.GoogleVertex,
  },
  {
    label: 'Quit',
    value: 'quit',
  },
];

export const AuthenticationStep: React.FC<AuthenticationStepProps> = ({
  onAuthComplete,
  onAuthError,
  onQuit,
}) => {
  const [phase, setPhase] = useState<
    'select' | 'anthropic' | 'bedrock_setup' | 'vertex_setup' | 'claude_setup'
  >('select');
  const [anthropicKey, setAnthropicKey] = useState('');

  const handleAuthMethodSelect = (item: SelectItem) => {
    switch (item.value) {
      case AuthMethod.ClaudeCode:
        setPhase('claude_setup');
        break;
      case AuthMethod.AnthropicApi:
        setPhase('anthropic');
        break;
      case AuthMethod.AwsBedrock:
        setPhase('bedrock_setup');
        break;
      case AuthMethod.GoogleVertex:
        setPhase('vertex_setup');
        break;
      case 'quit':
        onQuit();
        break;
    }
  };

  const handleAnthropicSubmit = async () => {
    if (!validateApiKey(anthropicKey)) {
      return;
    }

    try {
      const authConfig: AuthConfig = { anthropic_api_key: anthropicKey };
      await saveAuthConfig(authConfig);
      await loadAndSetupAuth();
      const isAuthenticated = await checkClaudeCodeAuth();

      if (isAuthenticated) {
        onAuthComplete();
      } else {
        onAuthError('Authentication failed. Please check your API key.');
      }
    } catch (error) {
      onAuthError(error instanceof Error ? error.message : String(error));
    }
  };

  if (phase === 'select') {
    return (
      <Box flexDirection="column">
        <Text>
          <Text bold>Chorenzo</Text> requires <Text bold>Claude Code</Text>{' '}
          authentication to function.
        </Text>
        <Text>Please choose an authentication method:</Text>
        <SelectInput items={authOptions} onSelect={handleAuthMethodSelect} />
      </Box>
    );
  }

  if (phase === 'claude_setup') {
    return (
      <Box flexDirection="column">
        <Text color="blue">
          📖 Please follow these steps:
          <Newline />
        </Text>
        <Text>1. Install Claude Code by following the setup guide:</Text>
        <Text color="cyan">
          {'   '}
          https://docs.anthropic.com/en/docs/claude-code/setup
          <Newline />
        </Text>
        <Text>2. Authenticate using one of these methods:</Text>
        <Text> • Log in with your Claude subscription</Text>
        <Text> • Connect through Anthropic Console</Text>
        <Text>
          {' '}
          • Configure for enterprise (Bedrock/Vertex AI)
          <Newline />
        </Text>
        <Text>
          3. Run 'chorenzo init' again after authentication
          <Newline />
        </Text>
        <Text color="yellow">Exiting...</Text>
      </Box>
    );
  }

  if (phase === 'anthropic') {
    return (
      <Box flexDirection="column">
        <Text>Enter your Anthropic API key:</Text>
        <Text color="gray">
          (Get one from https://console.anthropic.com/settings/keys)
        </Text>
        <Text>
          <Newline />
        </Text>
        <Box>
          <Text>API Key: </Text>
          <TextInput
            value={anthropicKey}
            onChange={setAnthropicKey}
            onSubmit={handleAnthropicSubmit}
            mask="*"
          />
        </Box>
        <Text>
          <Newline />
        </Text>
        {anthropicKey && !validateApiKey(anthropicKey) && (
          <Text color="red">
            Invalid API key format. Should start with sk-ant-
          </Text>
        )}
      </Box>
    );
  }

  if (phase === 'bedrock_setup') {
    return (
      <Box flexDirection="column">
        <Text color="blue">
          📖 AWS Bedrock Setup:
          <Newline />
        </Text>
        <Text>1. Set up AWS credentials using your preferred method:</Text>
        <Text> • AWS CLI: aws configure</Text>
        <Text>
          {' '}
          • Environment variables: AWS_REGION, AWS_ACCESS_KEY_ID,
          AWS_SECRET_ACCESS_KEY
        </Text>
        <Text>
          {' '}
          • IAM roles or AWS SSO
          <Newline />
        </Text>
        <Text>2. Set Claude Code to use Bedrock:</Text>
        <Text color="cyan">
          {' '}
          export CLAUDE_CODE_USE_BEDROCK=1
          <Newline />
        </Text>
        <Text>
          3. Run 'chorenzo init' again after setup
          <Newline />
        </Text>
        <Text color="yellow">Exiting...</Text>
      </Box>
    );
  }

  if (phase === 'vertex_setup') {
    return (
      <Box flexDirection="column">
        <Text color="blue">
          📖 Google Vertex AI Setup:
          <Newline />
        </Text>
        <Text>1. Set up GCP authentication:</Text>
        <Text> • gcloud auth application-default login</Text>
        <Text>
          {' '}
          • Service account key file
          <Newline />
        </Text>
        <Text>2. Set required environment variables:</Text>
        <Text color="cyan"> export CLAUDE_CODE_USE_VERTEX=1</Text>
        <Text color="cyan">
          {' '}
          export ANTHROPIC_VERTEX_PROJECT_ID=your-project-id
        </Text>
        <Text color="cyan">
          {' '}
          export CLOUD_ML_REGION=us-central1
          <Newline />
        </Text>
        <Text>
          3. Run 'chorenzo init' again after setup
          <Newline />
        </Text>
        <Text color="yellow">Exiting...</Text>
      </Box>
    );
  }

  return null;
};
