import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { checkGitAvailable, cloneRepository, GitError } from '../utils/git-operations.utils';
import { retry } from '../utils/retry.utils';
import { readYaml, writeYaml, YamlError } from '../utils/yaml.utils';
import { readJson, writeJson } from '../utils/json.utils';
import { Logger } from '../utils/logger.utils';

class ChorenzoConfig {
  get dir(): string {
    return path.join(os.homedir(), '.chorenzo');
  }

  get configPath(): string {
    return path.join(this.dir, 'config.yaml');
  }

  get statePath(): string {
    return path.join(this.dir, 'state.json');
  }

  get recipesDir(): string {
    return path.join(this.dir, 'recipes');
  }

  createRecipesDir(): void {
    fs.mkdirSync(this.recipesDir, { recursive: true });
  }

  configExists(): boolean {
    return fs.existsSync(this.configPath);
  }

  async writeDefaultConfig(): Promise<void> {
    const defaultConfig: Config = {
      libraries: {
        core: {
          repo: 'https://github.com/chorenzo-dev/recipes-core.git',
          ref: 'main'
        }
      }
    };
    await writeYaml(this.configPath, defaultConfig);
  }

  async readConfig(): Promise<Config> {
    return await readYaml<Config>(this.configPath);
  }

  stateExists(): boolean {
    return fs.existsSync(this.statePath);
  }

  async writeDefaultState(): Promise<void> {
    const defaultState: State = {
      last_checked: '1970-01-01T00:00:00Z'
    };
    await writeJson(this.statePath, defaultState);
  }

  removeRecipesDir(): void {
    if (fs.existsSync(this.recipesDir)) {
      fs.rmSync(this.recipesDir, { recursive: true, force: true });
    }
  }

  removeConfigFile(): void {
    if (fs.existsSync(this.configPath)) {
      fs.unlinkSync(this.configPath);
    }
  }

  removeStateFile(): void {
    if (fs.existsSync(this.statePath)) {
      fs.unlinkSync(this.statePath);
    }
  }

  getLibraryPath(libName: string): string {
    return path.join(this.recipesDir, libName);
  }

  libraryExists(libName: string): boolean {
    return fs.existsSync(this.getLibraryPath(libName));
  }
}

const chorenzoConfig = new ChorenzoConfig();

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
  Logger.info({ 
    event: 'init_started',
    command: 'init',
    options 
  }, 'Chorenzo initialization started');
  
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
            onProgress?.(`Retrying clone of ${libName} (attempt ${attempt + 1})...`);
          }
        }
      );
      onProgress?.(`Successfully cloned ${libName}`);
    } catch (error) {
      onProgress?.(`Warning: Failed to clone ${libName} after retry, skipping...`);
    }
  }
}

