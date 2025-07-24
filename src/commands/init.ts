import {
  checkGitAvailable,
  cloneRepository,
  GitError,
} from '../utils/git-operations.utils';
import { retry } from '../utils/retry.utils';
import { YamlError } from '../utils/yaml.utils';
import { Logger } from '../utils/logger.utils';
import { chorenzoConfig } from '../utils/config.utils';
import { ChorenzoConfig as Config } from '../types/config';
import { checkClaudeCodeAuth } from '../utils/claude.utils';

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
      onProgress?.('Resetting workspace...');
      await resetWorkspace();
    }

    onProgress?.('Checking Claude Code authentication...');
    const isAuthenticated = await checkClaudeCodeAuth();

    if (!isAuthenticated) {
      throw new InitError(
        'Claude Code is not authenticated. Please complete authentication setup.',
        'AUTH_REQUIRED'
      );
    }

    onProgress?.('Creating directory structure...');
    await createDirectoryStructure();

    onProgress?.('Setting up configuration files...');
    await setupConfigFiles();

    onProgress?.('Reading configuration...');
    const config = await readConfig();

    onProgress?.('Cloning recipe libraries...');
    await cloneLibraries(config, onProgress);

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

async function readConfig(): Promise<Config> {
  try {
    const config = await chorenzoConfig.readConfig();

    if (!config.libraries || typeof config.libraries !== 'object') {
      throw new InitError(
        'Invalid config.yaml: missing or invalid libraries section',
        'INVALID_CONFIG'
      );
    }

    return config;
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

async function cloneLibraries(
  config: Config,
  onProgress?: ProgressCallback
): Promise<void> {
  await checkGitAvailable();

  for (const [libName, libConfig] of Object.entries(config.libraries)) {
    if (chorenzoConfig.libraryExists(libName)) {
      onProgress?.(`Skipping ${libName} (already exists)`);
      continue;
    }

    const libPath = chorenzoConfig.getLibraryPath(libName);

    onProgress?.(`Cloning ${libName} from ${libConfig.repo}...`);

    try {
      await retry(
        () => cloneRepository(libConfig.repo, libPath, libConfig.ref),
        {
          maxAttempts: 2,
          onRetry: (attempt) => {
            onProgress?.(
              `Retrying clone of ${libName} (attempt ${attempt + 1})...`
            );
          },
        }
      );
      onProgress?.(`Successfully cloned ${libName}`);
    } catch {
      onProgress?.(
        `Warning: Failed to clone ${libName} after retry, skipping...`
      );
    }
  }
}
