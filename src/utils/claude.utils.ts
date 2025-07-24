import { query } from '@anthropic-ai/claude-code';
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
    const testQuery = query({
      prompt: 'Test auth by saying "authenticated"',
      options: {
        model: 'sonnet',
        maxTurns: 1,
        allowedTools: [],
        permissionMode: 'bypassPermissions',
      },
    });

    for await (const message of testQuery) {
      if (message.type === 'result') {
        return !message.is_error;
      }
    }
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
