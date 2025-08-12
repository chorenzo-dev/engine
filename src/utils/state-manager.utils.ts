import * as fs from 'fs';
import * as path from 'path';
import * as writeFileAtomic from 'write-file-atomic';

import { WorkspaceState } from '~/types/state';

import { validatePathWithinWorkspace } from './path.utils';
import { workspaceConfig } from './workspace-config.utils';

export class StateManagerError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'StateManagerError';
  }
}

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
    try {
      validatePathWithinWorkspace(
        projectPath,
        workspaceConfig.getWorkspaceRoot()
      );
    } catch (error) {
      throw new StateManagerError(
        `Invalid project path: ${error instanceof Error ? error.message : 'Path validation failed'}`,
        'INVALID_PROJECT_PATH'
      );
    }

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
        const rawContent = fs.readFileSync(this.statePath, 'utf-8');
        const rawState = JSON.parse(rawContent);
        return this.validateStateStructure(rawState);
      } else {
        return { workspace: {}, projects: {} };
      }
    } catch (error) {
      if (error instanceof StateManagerError) {
        throw error;
      }
      if (error instanceof SyntaxError) {
        throw new StateManagerError(
          `Invalid JSON in state file: ${error.message}`,
          'INVALID_JSON'
        );
      }
      return { workspace: {}, projects: {} };
    }
  }

  private saveState(state: WorkspaceState): void {
    try {
      workspaceConfig.ensureChorenzoDir();
      const sortedState = this.sortStateKeys(state);
      const content = JSON.stringify(sortedState, null, 2);
      writeFileAtomic.sync(this.statePath, content, { mode: 0o600 });
    } catch (error) {
      throw new StateManagerError(
        `Failed to save state: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SAVE_FAILED'
      );
    }
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

  private validateStateStructure(data: unknown): WorkspaceState {
    if (!this.isValidStateObject(data)) {
      throw new StateManagerError(
        'Invalid state structure: expected object with workspace and projects properties',
        'INVALID_STATE_STRUCTURE'
      );
    }

    const state = data as Record<string, unknown>;

    if (state.workspace !== undefined && typeof state.workspace !== 'object') {
      throw new StateManagerError(
        'Invalid state structure: workspace must be an object',
        'INVALID_WORKSPACE_STRUCTURE'
      );
    }

    if (state.projects !== undefined && typeof state.projects !== 'object') {
      throw new StateManagerError(
        'Invalid state structure: projects must be an object',
        'INVALID_PROJECTS_STRUCTURE'
      );
    }

    return {
      workspace: (state.workspace as Record<string, unknown>) || {},
      projects:
        (state.projects as Record<string, Record<string, unknown>>) || {},
    };
  }

  private isValidStateObject(obj: unknown): boolean {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      return false;
    }

    const state = obj as Record<string, unknown>;

    if (
      state.workspace !== undefined &&
      (typeof state.workspace !== 'object' || Array.isArray(state.workspace))
    ) {
      return false;
    }

    if (
      state.projects !== undefined &&
      (typeof state.projects !== 'object' || Array.isArray(state.projects))
    ) {
      return false;
    }

    return true;
  }

  recordAppliedRecipe(
    recipeName: string,
    level: 'workspace' | 'project',
    projectPath?: string
  ): void {
    const appliedKey = `${recipeName}.applied`;

    if (level === 'workspace') {
      this.setWorkspaceValue(appliedKey, true);
    } else if (level === 'project' && projectPath) {
      this.setProjectValue(projectPath, appliedKey, true);
    } else {
      throw new StateManagerError(
        'Project path is required when recording applied recipe at project level',
        'MISSING_PROJECT_PATH'
      );
    }
  }

  isRecipeApplied(
    recipeName: string,
    level: 'workspace' | 'project',
    projectPath?: string
  ): boolean {
    const appliedKey = `${recipeName}.applied`;
    const state = this.loadState();

    if (level === 'workspace') {
      return state.workspace?.[appliedKey] === true;
    } else if (level === 'project' && projectPath) {
      try {
        validatePathWithinWorkspace(
          projectPath,
          workspaceConfig.getWorkspaceRoot()
        );
      } catch (error) {
        throw new StateManagerError(
          `Invalid project path: ${error instanceof Error ? error.message : 'Path validation failed'}`,
          'INVALID_PROJECT_PATH'
        );
      }

      const relativePath = path.relative(
        workspaceConfig.getWorkspaceRoot(),
        projectPath
      );
      return state.projects?.[relativePath]?.[appliedKey] === true;
    } else {
      throw new StateManagerError(
        'Project path is required when checking applied recipe at project level',
        'MISSING_PROJECT_PATH'
      );
    }
  }
}

export const stateManager = new WorkspaceStateManager();
