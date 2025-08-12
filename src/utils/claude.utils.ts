import { AuthConfig } from '~/types/config';

import { chorenzoConfig } from './config.utils';
import { Logger } from './logger.utils';
import { spawnAsync } from './process.utils';

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function checkClaudeCodeAuth(): Promise<boolean> {
  try {
    if (process.env['ANTHROPIC_API_KEY']) {
      Logger.info(
        { event: 'auth_check_method', method: 'ANTHROPIC_API_KEY' },
        'Using ANTHROPIC_API_KEY for authentication'
      );
      return true;
    }

    if (process.env['ANTHROPIC_AUTH_TOKEN']) {
      Logger.info(
        { event: 'auth_check_method', method: 'ANTHROPIC_AUTH_TOKEN' },
        'Using ANTHROPIC_AUTH_TOKEN for authentication'
      );
      return true;
    }

    if (process.env['AWS_BEARER_TOKEN_BEDROCK']) {
      Logger.info(
        { event: 'auth_check_method', method: 'AWS_BEARER_TOKEN_BEDROCK' },
        'Using AWS_BEARER_TOKEN_BEDROCK for authentication'
      );
      return true;
    }

    if (process.env['CLAUDE_CODE_USE_BEDROCK'] === '1') {
      Logger.info(
        { event: 'auth_check_method', method: 'CLAUDE_CODE_USE_BEDROCK' },
        'Using Bedrock for authentication'
      );
      return true;
    }

    if (process.env['CLAUDE_CODE_USE_VERTEX'] === '1') {
      Logger.info(
        { event: 'auth_check_method', method: 'CLAUDE_CODE_USE_VERTEX' },
        'Using Vertex AI for authentication'
      );
      return true;
    }

    Logger.info(
      { event: 'auth_check_method', method: 'claude_cli' },
      'Using Claude CLI for authentication check'
    );

    const versionResult = await spawnAsync('claude', ['--version'], {
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (versionResult.error || versionResult.status !== 0) {
      Logger.error(
        {
          event: 'auth_check_failed',
          reason: 'claude_version_failed',
          error: versionResult.error?.message,
          status: versionResult.status,
          stderr: versionResult.stderr,
        },
        'Claude CLI --version check failed'
      );
      return false;
    }

    const testResult = await spawnAsync('claude', ['-p', 'status'], {
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
      input: '',
    });

    const output = (testResult.stdout || '') + (testResult.stderr || '');

    Logger.info(
      {
        event: 'claude_cli_status_result',
        stdout: testResult.stdout,
        stderr: testResult.stderr,
        output_length: output.length,
      },
      'Claude CLI status command result'
    );

    if (output.includes('Invalid API key') || output.includes('/login')) {
      Logger.warn(
        { event: 'auth_check_failed', reason: 'invalid_api_key_or_login' },
        'Claude CLI output indicates invalid API key or login required'
      );
      return false;
    }

    if (
      output.includes('not authenticated') ||
      output.includes('Please run') ||
      output.includes('claude login') ||
      output.includes('Invalid API key')
    ) {
      Logger.warn(
        { event: 'auth_check_failed', reason: 'not_authenticated' },
        'Claude CLI output indicates not authenticated'
      );
      return false;
    }

    if (
      testResult.status === 0 &&
      testResult.stdout &&
      testResult.stdout.length > 0
    ) {
      Logger.info(
        { event: 'auth_check_success', reason: 'valid_status_output' },
        'Claude CLI status command succeeded with output'
      );
      return true;
    }

    Logger.warn(
      {
        event: 'auth_check_failed',
        reason: 'no_valid_output',
        stdout_length: testResult.stdout?.length || 0,
        stderr_length: testResult.stderr?.length || 0,
      },
      'Claude CLI status command did not return valid output'
    );
    return false;
  } catch (error) {
    Logger.error(
      {
        event: 'auth_check_failed',
        reason: 'exception',
        error: error instanceof Error ? error.message : String(error),
      },
      'Claude Code authentication check threw exception'
    );
    return false;
  }
}

export async function saveAuthConfig(authConfig: AuthConfig): Promise<void> {
  const config = await chorenzoConfig.readConfig();
  config.auth = authConfig;
  await chorenzoConfig.writeConfig(config);

  Logger.info(
    {
      event: 'auth_config_saved',
      has_anthropic: !!authConfig.anthropic_api_key,
    },
    'Authentication configuration saved'
  );
}

async function setupEnvironmentForAuth(authConfig: AuthConfig): Promise<void> {
  if (authConfig.anthropic_api_key) {
    process.env['ANTHROPIC_API_KEY'] = authConfig.anthropic_api_key;
  }
}

export async function loadAndSetupAuth(): Promise<void> {
  try {
    if (!chorenzoConfig.configExists()) {
      return;
    }

    const config = await chorenzoConfig.readConfig();
    if (config.auth) {
      await setupEnvironmentForAuth(config.auth);
    }
  } catch (error) {
    Logger.warn(
      {
        event: 'auth_setup_failed',
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to load and setup authentication'
    );
  }
}

export function validateApiKey(apiKey: string): boolean {
  return apiKey.startsWith('sk-ant-') && apiKey.length > 20;
}
