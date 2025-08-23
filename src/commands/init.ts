import { chorenzoConfig } from '~/utils/config.utils';
import { GitError } from '~/utils/git-operations.utils';
import { GitignoreManager } from '~/utils/gitignore.utils';
import { libraryManager } from '~/utils/library-manager.utils';
import { Logger } from '~/utils/logger.utils';
import { workspaceConfig } from '~/utils/workspace-config.utils';
import { YamlError } from '~/utils/yaml.utils';

import { formatErrorMessage } from '../utils/error.utils';

export type { Config } from '~/types/config';

export interface InitOptions {
  reset?: boolean;
}

export type ProgressCallback = (step: string) => void;

export class InitError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'InitError';
  }
}

export async function performInit(
  options: InitOptions = {},
  onProgress?: ProgressCallback
): Promise<void> {
  Logger.info(
    {
      event: 'init_started',
      command: 'init',
      options,
    },
    'Chorenzo initialization started'
  );

  try {
    if (options.reset) {
      onProgress?.('Resetting workspace');
      resetWorkspace();
    }

    onProgress?.('Creating directory structure');
    createDirectoryStructure();

    onProgress?.('Setting up configuration files');
    await setupConfigFiles();

    onProgress?.('Setting up git ignore patterns');
    setupGitIgnore();

    onProgress?.('Validating configuration');
    await validateConfig();

    onProgress?.('Cloning recipe libraries');
    await libraryManager.cloneLibraries(onProgress);

    onProgress?.('Initialization complete!');
  } catch (error) {
    if (
      error instanceof InitError ||
      error instanceof GitError ||
      error instanceof YamlError
    ) {
      throw error;
    }
    throw new InitError(
      formatErrorMessage('Init failed', error),
      'INIT_FAILED'
    );
  }
}

function resetWorkspace(): void {
  chorenzoConfig.removeRecipesDir();
  chorenzoConfig.removeConfigFile();
}

function createDirectoryStructure(): void {
  chorenzoConfig.createRecipesDir();
  workspaceConfig.ensureChorenzoDir();
}

async function setupConfigFiles(): Promise<void> {
  if (!chorenzoConfig.configExists()) {
    await chorenzoConfig.writeDefaultConfig();
  }
}

function setupGitIgnore(): void {
  const workspaceRoot = workspaceConfig.getWorkspaceRoot();
  GitignoreManager.ensureChorenzoIgnorePatterns(workspaceRoot);
}

async function validateConfig(): Promise<void> {
  try {
    const config = await chorenzoConfig.readConfig();

    if (!config.libraries || typeof config.libraries !== 'object') {
      throw new InitError(
        'Invalid config.yaml: missing or invalid libraries section',
        'INVALID_CONFIG'
      );
    }
  } catch (error) {
    if (error instanceof InitError) {
      throw error;
    }
    if (error instanceof YamlError) {
      throw new InitError(
        formatErrorMessage('Failed to read config.yaml', error),
        'CONFIG_READ_ERROR'
      );
    }
    throw new InitError(
      formatErrorMessage('Failed to read config.yaml', error),
      'CONFIG_READ_ERROR'
    );
  }
}
