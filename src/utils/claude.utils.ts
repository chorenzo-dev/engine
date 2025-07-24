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
    // Log all environment variables that might affect auth
    Logger.debug(
      {
        event: 'auth_check_start',
        env: {
          ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
          ANTHROPIC_AUTH_TOKEN: !!process.env.ANTHROPIC_AUTH_TOKEN,
          AWS_BEARER_TOKEN_BEDROCK: !!process.env.AWS_BEARER_TOKEN_BEDROCK,
          CLAUDE_CODE_USE_BEDROCK: process.env.CLAUDE_CODE_USE_BEDROCK,
          CLAUDE_CODE_USE_VERTEX: process.env.CLAUDE_CODE_USE_VERTEX,
          CLAUDECODE: process.env.CLAUDECODE,
        },
      },
      'Starting Claude Code authentication check'
    );

    // 1. Check for Anthropic API Key (official Claude Code env var)
    if (process.env.ANTHROPIC_API_KEY) {
      Logger.debug(
        {
          event: 'auth_check_anthropic_api_key',
        },
        'Found ANTHROPIC_API_KEY environment variable'
      );
      return true;
    }

    // 2. Check for Anthropic Auth Token (official Claude Code env var)
    if (process.env.ANTHROPIC_AUTH_TOKEN) {
      Logger.debug(
        {
          event: 'auth_check_anthropic_auth_token',
        },
        'Found ANTHROPIC_AUTH_TOKEN environment variable'
      );
      return true;
    }

    // 3. Check for AWS Bedrock token (official Claude Code env var)
    if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
      Logger.debug(
        {
          event: 'auth_check_bedrock_token',
        },
        'Found AWS_BEARER_TOKEN_BEDROCK environment variable'
      );
      return true;
    }

    // 4. Check if Bedrock is configured (official Claude Code env var)
    if (process.env.CLAUDE_CODE_USE_BEDROCK === '1') {
      Logger.debug(
        {
          event: 'auth_check_bedrock_enabled',
        },
        'Found CLAUDE_CODE_USE_BEDROCK=1 environment variable'
      );
      return true;
    }

    // 5. Check if Vertex AI is configured (official Claude Code env var)
    if (process.env.CLAUDE_CODE_USE_VERTEX === '1') {
      Logger.debug(
        {
          event: 'auth_check_vertex_enabled',
        },
        'Found CLAUDE_CODE_USE_VERTEX=1 environment variable'
      );
      return true;
    }

    // 6. Check if Claude CLI is installed and authenticated
    const cliResult = spawnSync('claude', ['--version'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (cliResult.error || cliResult.status !== 0) {
      Logger.debug(
        {
          event: 'auth_check_no_claude_cli',
          error: cliResult.error?.message,
          exitCode: cliResult.status,
        },
        'Claude CLI not available or not working'
      );
      return false;
    }

    // 7. Try a minimal Claude CLI test
    const testResult = spawnSync('claude', ['-p', 'status'], {
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
      input: '',
    });

    const output = (testResult.stdout || '') + (testResult.stderr || '');

    // If command timed out, assume not authenticated
    if (testResult.signal === 'SIGTERM') {
      Logger.debug(
        {
          event: 'auth_check_cli_timeout',
          timeout: 30000,
        },
        'Claude CLI command timed out after 30s - likely not authenticated'
      );
      return false;
    }

    if (output.includes('Invalid API key') || output.includes('/login')) {
      Logger.debug(
        {
          event: 'auth_check_cli_not_authenticated',
          stdout: testResult.stdout,
          stderr: testResult.stderr,
          exitCode: testResult.status,
        },
        'Claude CLI reports authentication required'
      );
      return false;
    }

    // Check for authentication errors
    if (
      output.includes('not authenticated') ||
      output.includes('Please run') ||
      output.includes('claude login') ||
      output.includes('Invalid API key')
    ) {
      Logger.debug(
        {
          event: 'auth_check_cli_not_authenticated',
          stdout: testResult.stdout,
          stderr: testResult.stderr,
          exitCode: testResult.status,
        },
        'Claude CLI reports not authenticated'
      );
      return false;
    }

    // Exit code 0 with output indicates success
    if (
      testResult.status === 0 &&
      testResult.stdout &&
      testResult.stdout.length > 0
    ) {
      Logger.debug(
        {
          event: 'auth_check_cli_success',
          exitCode: testResult.status,
          outputLength: testResult.stdout.length,
        },
        'Claude CLI authentication verified'
      );
      return true;
    }

    // Any other case is a failure
    Logger.debug(
      {
        event: 'auth_check_cli_failed',
        stdout: testResult.stdout,
        stderr: testResult.stderr,
        exitCode: testResult.status,
      },
      'Claude CLI check failed'
    );
    return false;
  } catch (error) {
    Logger.debug(
      {
        event: 'auth_check_failed',
        error: error instanceof Error ? error.message : String(error),
      },
      'Claude Code authentication check failed'
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
    Logger.debug(
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
