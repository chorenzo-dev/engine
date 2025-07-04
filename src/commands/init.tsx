import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { checkGitAvailable, cloneRepository, GitError } from '../utils/git-operations.utils';
import { retry } from '../utils/retry.utils';
import { readYaml, writeYaml, YamlError } from '../utils/yaml.utils';

const CHORENZO_DIR = path.join(os.homedir(), '.chorenzo');
const CONFIG_PATH = path.join(CHORENZO_DIR, 'config.yaml');
const STATE_PATH = path.join(CHORENZO_DIR, 'state.yaml');
const RECIPES_DIR = path.join(CHORENZO_DIR, 'recipes');

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
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'InitError';
  }
}

export async function performInit(options: InitOptions = {}, onProgress?: ProgressCallback): Promise<void> {
  try {
    if (options.reset) {
      onProgress?.('Resetting workspace...');
      await resetWorkspace();
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
    if (error instanceof InitError || error instanceof GitError || error instanceof YamlError) {
      throw error;
    }
    throw new InitError(
      `Init failed: ${error instanceof Error ? error.message : String(error)}`,
      'INIT_FAILED'
    );
  }
}

async function resetWorkspace(): Promise<void> {
  if (fs.existsSync(RECIPES_DIR)) {
    fs.rmSync(RECIPES_DIR, { recursive: true, force: true });
  }

  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }

  if (fs.existsSync(STATE_PATH)) {
    fs.unlinkSync(STATE_PATH);
  }
}

async function createDirectoryStructure(): Promise<void> {
  fs.mkdirSync(RECIPES_DIR, { recursive: true });
}

async function setupConfigFiles(): Promise<void> {
  if (!fs.existsSync(CONFIG_PATH)) {
    const defaultConfig: Config = {
      libraries: {
        core: {
          repo: 'https://github.com/chorenzo-dev/recipes-core.git',
          ref: 'main'
        }
      }
    };
    await writeYaml(CONFIG_PATH, defaultConfig);
  }

  if (!fs.existsSync(STATE_PATH)) {
    const defaultState: State = {
      last_checked: '1970-01-01T00:00:00Z'
    };
    await writeYaml(STATE_PATH, defaultState);
  }
}

async function readConfig(): Promise<Config> {
  try {
    const config = await readYaml<Config>(CONFIG_PATH);
    
    if (!config.libraries || typeof config.libraries !== 'object') {
      throw new InitError('Invalid config.yaml: missing or invalid libraries section', 'INVALID_CONFIG');
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

async function cloneLibraries(config: Config, onProgress?: ProgressCallback): Promise<void> {
  await checkGitAvailable();

  for (const [libName, libConfig] of Object.entries(config.libraries)) {
    const libPath = path.join(RECIPES_DIR, libName);
    
    if (fs.existsSync(libPath)) {
      onProgress?.(`Skipping ${libName} (already exists)`);
      continue;
    }

    onProgress?.(`Cloning ${libName} from ${libConfig.repo}...`);
    
    try {
      await retry(
        () => cloneRepository(libConfig.repo, libPath, libConfig.ref),
        {
          maxAttempts: 2,
          onRetry: (attempt) => {
            onProgress?.(`Retrying clone of ${libName} (attempt ${attempt + 1})...`);
          }
        }
      );
      onProgress?.(`Successfully cloned ${libName}`);
    } catch (error) {
      onProgress?.(`Warning: Failed to clone ${libName} after retry, skipping...`);
      console.warn(`Failed to clone library ${libName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

