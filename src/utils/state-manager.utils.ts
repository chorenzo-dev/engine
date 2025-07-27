import * as fs from 'fs';
import * as path from 'path';
import { workspaceConfig } from './workspace-config.utils';
import { WorkspaceState } from '../types/state';

export class WorkspaceStateManager {
  private statePath: string;

  constructor() {
    this.statePath = workspaceConfig.getStatePath();
  }

  getWorkspaceState(): WorkspaceState {
    return this.loadState();
  }

  setWorkspaceValue(key: string, value: unknown): void {
    const state = this.loadState();
    if (!state.workspace) {
      state.workspace = {};
    }
    state.workspace[key] = value;
    this.saveState(state);
  }

  setProjectValue(projectPath: string, key: string, value: unknown): void {
    const state = this.loadState();
    const relativePath = path.relative(
      workspaceConfig.getWorkspaceRoot(),
      projectPath
    );
    if (!state.projects) {
      state.projects = {};
    }
    if (!state.projects[relativePath]) {
      state.projects[relativePath] = {};
    }
    state.projects[relativePath][key] = value;
    this.saveState(state);
  }

  private loadState(): WorkspaceState {
    try {
      if (fs.existsSync(this.statePath)) {
        const rawState = JSON.parse(fs.readFileSync(this.statePath, 'utf-8'));
        if (!rawState.workspace) {
          rawState.workspace = {};
        }
        if (!rawState.projects) {
          rawState.projects = {};
        }
        return rawState;
      } else {
        return { workspace: {}, projects: {} };
      }
    } catch {
      return { workspace: {}, projects: {} };
    }
  }

  private saveState(state: WorkspaceState): void {
    workspaceConfig.ensureChorenzoDir();
    const sortedState = this.sortStateKeys(state);
    fs.writeFileSync(this.statePath, JSON.stringify(sortedState, null, 2));
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
