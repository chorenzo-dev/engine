import { checkClaudeCodeAuth } from '~/utils/claude.utils';
import { Logger } from '~/utils/logger.utils';

import { extractErrorMessage, formatErrorMessage } from '../utils/error.utils';

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function performAuthCheck(): Promise<boolean> {
  Logger.info(
    {
      event: 'auth_check_started',
      command: 'auth-check',
    },
    'Claude Code authentication check started'
  );

  try {
    const isAuthenticated = await checkClaudeCodeAuth();

    Logger.info(
      {
        event: 'auth_check_completed',
        command: 'auth-check',
        isAuthenticated,
      },
      `Authentication check completed: ${isAuthenticated ? 'authenticated' : 'not authenticated'}`
    );

    return isAuthenticated;
  } catch (error) {
    const errorMsg = extractErrorMessage(error);
    Logger.error(
      {
        event: 'auth_check_failed',
        command: 'auth-check',
        error: errorMsg,
      },
      'Authentication check failed'
    );

    throw new AuthError(
      formatErrorMessage('Authentication check failed', error),
      'AUTH_CHECK_FAILED'
    );
  }
}
