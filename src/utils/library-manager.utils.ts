import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { simpleGit } from 'simple-git';
import {
  checkGitAvailable,
  cloneRepository,
  GitError,
} from './git-operations.utils';
import { retry } from './retry.utils';
import { Logger } from './logger.utils';
import { chorenzoConfig } from './chorenzo-config.utils';
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
  isRemoteLibrary(recipePath: string): string | null {
    const normalizedPath = path.normalize(recipePath);
    const recipesDir = path.normalize(chorenzoConfig.recipesDir);

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

    if (!chorenzoConfig.libraryExists(libraryName)) {
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

  async findRecipeByName(recipeName: string): Promise<string[]> {
    const foundPaths: string[] = [];

    const searchDirectory = async (dir: string): Promise<void> => {
      if (!fs.existsSync(dir)) {
        return;
      }

      try {
        const entries = fs.readdirSync(dir);

        for (const entry of entries) {
          const fullPath = path.join(dir, entry);

          if (!fs.statSync(fullPath).isDirectory()) {
            continue;
          }

          if (entry === recipeName) {
            const metadataPath = path.join(fullPath, 'metadata.yaml');
            if (fs.existsSync(metadataPath)) {
              foundPaths.push(fullPath);
            }
          } else {
            await searchDirectory(fullPath);
          }
        }
      } catch (error) {
        Logger.warn(
          {
            directory: dir,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to search directory for recipes'
        );
      }
    };

    await searchDirectory(chorenzoConfig.recipesDir);
    return foundPaths;
  }

  async validateGitRepository(
    gitUrl: string
  ): Promise<{ valid: boolean; error?: string }> {
    const tempDir = path.join(os.tmpdir(), `chorenzo-validate-${Date.now()}`);

    try {
      await checkGitAvailable();
      await cloneRepository(gitUrl, tempDir, 'HEAD');

      fs.rmSync(tempDir, { recursive: true, force: true });
      return { valid: true };
    } catch (error) {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async cloneLibraries(onProgress?: (message: string) => void): Promise<void> {
    await checkGitAvailable();

    const config = await this.getConfig();

    for (const [libName, libConfig] of Object.entries(config.libraries)) {
      if (chorenzoConfig.libraryExists(libName)) {
        onProgress?.(`Skipping ${libName} (already exists)`);
        continue;
      }

      const libPath = this.getLibraryPath(libName);

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

  private async getConfig(): Promise<Config> {
    try {
      return await chorenzoConfig.readConfig();
    } catch (error) {
      throw new LibraryManagerError(
        `Failed to read config: ${error instanceof Error ? error.message : String(error)}`,
        'CONFIG_READ_ERROR'
      );
    }
  }

  private getLibraryPath(libraryName: string): string {
    return chorenzoConfig.getLibraryPath(libraryName);
  }

  private async getAllLibraryNames(): Promise<string[]> {
    const config = await this.getConfig();
    return Object.keys(config.libraries);
  }
}

export const libraryManager = new LibraryManager();
