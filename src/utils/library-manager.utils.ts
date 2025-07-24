import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { simpleGit } from 'simple-git';
import {
  checkGitAvailable,
  cloneRepository,
  GitError,
} from './git-operations.utils';
import { readYaml } from './yaml.utils';
import { retry } from './retry.utils';
import { Logger } from './logger.utils';
import type { Config } from '../commands/init';

export class LibraryManagerError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'LibraryManagerError';
  }
}

export class LibraryManager {
  private readonly configDir: string;
  private readonly recipesDir: string;
  private readonly configPath: string;

  constructor() {
    this.configDir = path.join(os.homedir(), '.chorenzo');
    this.recipesDir = path.join(this.configDir, 'recipes');
    this.configPath = path.join(this.configDir, 'config.yaml');
  }

  async getConfig(): Promise<Config> {
    try {
      return await readYaml<Config>(this.configPath);
    } catch (error) {
      throw new LibraryManagerError(
        `Failed to read config: ${error instanceof Error ? error.message : String(error)}`,
        'CONFIG_READ_ERROR'
      );
    }
  }

  getLibraryPath(libraryName: string): string {
    return path.join(this.recipesDir, libraryName);
  }

  isRemoteLibrary(recipePath: string): string | null {
    const normalizedPath = path.normalize(recipePath);
    const recipesDir = path.normalize(this.recipesDir);

    if (!normalizedPath.startsWith(recipesDir)) {
      return null;
    }

    const relativePath = path.relative(recipesDir, normalizedPath);
    const parts = relativePath.split(path.sep);

    if (parts.length > 0) {
      return parts[0];
    }

    return null;
  }

  async refreshLibrary(libraryName: string): Promise<void> {
    await checkGitAvailable();

    const config = await this.getConfig();
    const libraryConfig = config.libraries[libraryName];

    if (!libraryConfig) {
      throw new LibraryManagerError(
        `Library '${libraryName}' not found in configuration`,
        'LIBRARY_NOT_FOUND'
      );
    }

    const libraryPath = this.getLibraryPath(libraryName);

    if (!fs.existsSync(libraryPath)) {
      Logger.info(
        { library: libraryName },
        'Library not found locally, cloning...'
      );
      await retry(
        () =>
          cloneRepository(libraryConfig.repo, libraryPath, libraryConfig.ref),
        {
          maxAttempts: 2,
          onRetry: (attempt) => {
            Logger.info(
              { library: libraryName, attempt: attempt + 1 },
              'Retrying clone...'
            );
          },
        }
      );
      return;
    }

    Logger.info({ library: libraryName }, 'Refreshing library from remote...');

    const git = simpleGit(libraryPath);

    try {
      await git.fetch('origin', libraryConfig.ref);

      await git.reset(['--hard', `origin/${libraryConfig.ref}`]);

      Logger.info({ library: libraryName }, 'Successfully refreshed library');
    } catch (error) {
      throw new GitError(
        `Failed to refresh library '${libraryName}': ${error instanceof Error ? error.message : String(error)}`,
        'REFRESH_FAILED'
      );
    }
  }

  async refreshAllLibraries(): Promise<void> {
    const config = await this.getConfig();

    for (const libraryName of Object.keys(config.libraries)) {
      try {
        await this.refreshLibrary(libraryName);
      } catch (error) {
        Logger.warn(
          {
            library: libraryName,
            error: error instanceof Error ? error.message : String(error),
          },
          `Failed to refresh library '${libraryName}', continuing with others...`
        );
      }
    }
  }
}

export const libraryManager = new LibraryManager();
