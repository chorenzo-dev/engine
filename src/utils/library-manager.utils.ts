import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { simpleGit } from 'simple-git';

import type { Config, ConfigLibrary } from '~/types/config';

import { chorenzoConfig } from './config.utils';
import {
  GitError,
  checkGitAvailable,
  cloneRepository,
} from './git-operations.utils';
import { Logger } from './logger.utils';
import { retry } from './retry.utils';

export enum LocationType {
  Empty = 'empty',
  LibraryRoot = 'library_root',
  CategoryFolder = 'category_folder',
  Invalid = 'invalid',
}

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

    for (const [libName, libConfig] of Object.entries(config.libraries) as [
      string,
      ConfigLibrary,
    ][]) {
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

  analyzeLocation(locationPath: string): {
    type: LocationType;
    categoryName?: string;
    categories?: string[];
  } {
    if (!fs.existsSync(locationPath)) {
      return { type: LocationType.Empty };
    }

    const stat = fs.statSync(locationPath);
    if (!stat.isDirectory()) {
      throw new LibraryManagerError(
        `Location is not a directory: ${locationPath}`,
        'INVALID_LOCATION'
      );
    }

    const entries = fs.readdirSync(locationPath);
    if (entries.length === 0) {
      return { type: LocationType.Empty };
    }

    const subfolders = entries.filter((entry) => {
      const entryPath = path.join(locationPath, entry);
      try {
        return fs.statSync(entryPath).isDirectory();
      } catch {
        return false;
      }
    });

    if (subfolders.length === 0) {
      return { type: LocationType.Empty };
    }

    let recipeCount = 0;
    let categoryCount = 0;

    for (const subfolder of subfolders) {
      const subfolderPath = path.join(locationPath, subfolder);

      if (this.isRecipeFolder(subfolderPath)) {
        recipeCount++;
      } else if (this.isCategoryFolder(subfolderPath)) {
        categoryCount++;
      }
    }

    if (recipeCount > 0 && categoryCount > 0) {
      throw new LibraryManagerError(
        `Invalid hierarchy: location contains both recipe folders and category folders: ${locationPath}`,
        'MIXED_HIERARCHY'
      );
    }

    if (recipeCount > 0) {
      const categoryName = path.basename(locationPath);
      return { type: LocationType.CategoryFolder, categoryName };
    }

    if (categoryCount > 0) {
      const categories = subfolders.filter((subfolder) =>
        this.isCategoryFolder(path.join(locationPath, subfolder))
      );
      return { type: LocationType.LibraryRoot, categories };
    }

    throw new LibraryManagerError(
      `Location "${locationPath}" contains folders but none are recognized as recipe categories or recipes. Choose an empty directory or an existing recipe library instead.`,
      'UNKNOWN_HIERARCHY'
    );
  }

  private isRecipeFolder(folderPath: string): boolean {
    const metadataPath = path.join(folderPath, 'metadata.yaml');
    const promptPath = path.join(folderPath, 'prompt.md');
    return fs.existsSync(metadataPath) || fs.existsSync(promptPath);
  }

  private isCategoryFolder(folderPath: string): boolean {
    const entries = fs.readdirSync(folderPath);
    const subfolders = entries.filter((entry) => {
      const entryPath = path.join(folderPath, entry);
      try {
        return fs.statSync(entryPath).isDirectory();
      } catch {
        return false;
      }
    });

    return subfolders.some((subfolder) =>
      this.isRecipeFolder(path.join(folderPath, subfolder))
    );
  }

  async getAllCategories(searchPath?: string): Promise<string[]> {
    const recipesDir = searchPath || chorenzoConfig.recipesDir;
    const analysis = this.analyzeLocation(recipesDir);

    if (analysis.type === LocationType.Empty) {
      return [];
    }

    if (analysis.type === LocationType.CategoryFolder) {
      return [analysis.categoryName!];
    }

    if (analysis.type === LocationType.LibraryRoot && analysis.categories) {
      return analysis.categories.sort();
    }

    return [];
  }
}

export const libraryManager = new LibraryManager();
