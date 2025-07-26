import * as fs from 'fs';
import * as path from 'path';
import { readJson, writeJson } from './json.utils';
import { workspaceConfig } from './workspace-config.utils';
import { WorkspaceState } from '../types/state';

export class WorkspaceStateManager {
  private state: WorkspaceState = {};
  private statePath: string;

  constructor() {
    this.statePath = workspaceConfig.getStatePath();
  }

  async loadState(): Promise<void> {
    try {
      if (fs.existsSync(this.statePath)) {
        this.state = await readJson<WorkspaceState>(this.statePath);
        if (!this.state.projects) {
          this.state.projects = {};
        }
      } else {
        this.state = { projects: {} };
      }
    } catch {
      this.state = { projects: {} };
    }
  }

  async saveState(): Promise<void> {
    workspaceConfig.ensureChorenzoDir();
    const sortedState = this.sortStateKeys(this.state);
    await writeJson(this.statePath, sortedState);
  }

  setWorkspaceValue(key: string, value: unknown): void {
    this.state[key] = value;
  }

  setProjectValue(projectPath: string, key: string, value: unknown): void {
    const relativePath = path.relative(
      workspaceConfig.getWorkspaceRoot(),
      projectPath
    );
    if (!this.state.projects) {
      this.state.projects = {};
    }
    if (!this.state.projects[relativePath]) {
      this.state.projects[relativePath] = {};
    }
    this.state.projects[relativePath][key] = value;
  }

  private sortStateKeys(obj: unknown): unknown {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      return obj;
    }

    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj).sort();

    for (const key of keys) {
      sorted[key] = this.sortStateKeys((obj as Record<string, unknown>)[key]);
    }

    return sorted;
  }
}

export const stateManager = new WorkspaceStateManager();
