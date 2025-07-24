import { GitError } from '../utils/git-operations.utils';
import { YamlError } from '../utils/yaml.utils';
import { Logger } from '../utils/logger.utils';
import { chorenzoConfig } from '../utils/chorenzo-config.utils';
import { libraryManager } from '../utils/library-manager.utils';

export interface InitOptions {
  reset?: boolean;
}

export interface ConfigLibrary {
  repo: string;
  ref: string;
}

export interface Config {
  libraries: {
    [key: string]: ConfigLibrary;
  };
}

export interface State {
  last_checked: string;
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
      onProgress?.('Resetting workspace...');
      await resetWorkspace();
    }

    onProgress?.('Creating directory structure...');
    await createDirectoryStructure();

    onProgress?.('Setting up configuration files...');
    await setupConfigFiles();

    onProgress?.('Validating configuration...');
    await validateConfig();

    onProgress?.('Cloning recipe libraries...');
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
      `Init failed: ${error instanceof Error ? error.message : String(error)}`,
      'INIT_FAILED'
    );
  }
}

async function resetWorkspace(): Promise<void> {
  chorenzoConfig.removeRecipesDir();
  chorenzoConfig.removeConfigFile();
  chorenzoConfig.removeStateFile();
}

async function createDirectoryStructure(): Promise<void> {
  chorenzoConfig.createRecipesDir();
}

async function setupConfigFiles(): Promise<void> {
  if (!chorenzoConfig.configExists()) {
    await chorenzoConfig.writeDefaultConfig();
  }

  if (!chorenzoConfig.stateExists()) {
    await chorenzoConfig.writeDefaultState();
  }
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
        `Failed to read config.yaml: ${error.message}`,
        'CONFIG_READ_ERROR'
      );
    }
    throw new InitError(
      `Failed to read config.yaml: ${error instanceof Error ? error.message : String(error)}`,
      'CONFIG_READ_ERROR'
    );
  }
}
