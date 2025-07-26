import { spawnSync } from 'child_process';
import { Logger } from './logger.utils';
import { AuthConfig } from '../types/config';
import { chorenzoConfig } from './config.utils';

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
    if (process.env.ANTHROPIC_API_KEY) {
      return true;
    }

    if (process.env.ANTHROPIC_AUTH_TOKEN) {
      return true;
    }

    if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
      return true;
    }

    if (process.env.CLAUDE_CODE_USE_BEDROCK === '1') {
      return true;
    }

    if (process.env.CLAUDE_CODE_USE_VERTEX === '1') {
      return true;
    }

    const cliResult = spawnSync('claude', ['--version'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (cliResult.error || cliResult.status !== 0) {
      return false;
    }

    const testResult = spawnSync('claude', ['-p', 'status'], {
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
      input: '',
    });

    const output = (testResult.stdout || '') + (testResult.stderr || '');

    if (testResult.signal === 'SIGTERM') {
      return false;
    }

    if (output.includes('Invalid API key') || output.includes('/login')) {
      return false;
    }

    if (
      output.includes('not authenticated') ||
      output.includes('Please run') ||
      output.includes('claude login') ||
      output.includes('Invalid API key')
    ) {
      return false;
    }

    if (
      testResult.status === 0 &&
      testResult.stdout &&
      testResult.stdout.length > 0
    ) {
      return true;
    }

    return false;
  } catch {
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
    process.env.ANTHROPIC_API_KEY = authConfig.anthropic_api_key;
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
