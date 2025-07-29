import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { Config } from '~/types/config';

import { readYaml, writeYaml } from './yaml.utils';

export class ChorenzoConfig {
  get dir(): string {
    return path.join(os.homedir(), '.chorenzo');
  }

  get configPath(): string {
    return path.join(this.dir, 'config.yaml');
  }

  get recipesDir(): string {
    return path.join(this.dir, 'recipes');
  }

  get localRecipesDir(): string {
    return path.join(this.recipesDir, 'local');
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
          ref: 'main',
        },
      },
    };
    await writeYaml(this.configPath, defaultConfig);
  }

  async readConfig(): Promise<Config> {
    return await readYaml<Config>(this.configPath);
  }

  async writeConfig(config: Config): Promise<void> {
    await writeYaml(this.configPath, config);
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

  getLibraryPath(libName: string): string {
    return path.join(this.recipesDir, libName);
  }

  libraryExists(libName: string): boolean {
    return fs.existsSync(this.getLibraryPath(libName));
  }
}

export const chorenzoConfig = new ChorenzoConfig();
