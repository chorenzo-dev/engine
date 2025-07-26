import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readYaml, writeYaml } from './yaml.utils';
import { writeJson } from './json.utils';
import type { Config } from '../types/config';

interface State {
  last_checked: string;
}

export class ChorenzoConfig {
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
          ref: 'main',
        },
      },
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
      last_checked: '1970-01-01T00:00:00Z',
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

export const chorenzoConfig = new ChorenzoConfig();
