import * as fs from 'fs';
import * as path from 'path';
import * as writeFileAtomic from 'write-file-atomic';

import { WorkspaceState } from '~/types/state';

import { Logger } from './logger.utils';
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
      const errorMessage =
        error instanceof Error ? error.message : 'Path validation failed';
      Logger.error(
        {
          event: 'SECURITY_PATH_TRAVERSAL_BLOCKED',
          projectPath: path.relative(process.cwd(), projectPath),
          key,
          error: errorMessage,
        },
        'Blocked potential path traversal attempt in state manager'
      );
      throw new StateManagerError(
        `Invalid project path: ${errorMessage}`,
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
        let rawState: unknown;

        try {
          rawState = JSON.parse(rawContent);
        } catch (jsonError) {
          Logger.error(
            {
              event: 'SECURITY_JSON_VALIDATION_FAILED',
              statePath: path.relative(process.cwd(), this.statePath),
              error:
                jsonError instanceof Error
                  ? jsonError.message
                  : 'JSON parse failed',
            },
            'JSON parsing failed for state file - potential corruption or tampering'
          );
          throw new StateManagerError(
            `Invalid JSON in state file: ${jsonError instanceof Error ? jsonError.message : 'Parse failed'}`,
            'INVALID_JSON'
          );
        }

        return this.validateStateStructure(rawState);
      } else {
        return { workspace: {}, projects: {} };
      }
    } catch (error) {
      if (error instanceof StateManagerError) {
        throw error;
      }
      Logger.error(
        {
          event: 'SECURITY_STATE_LOAD_FAILED',
          statePath: path.relative(process.cwd(), this.statePath),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Unexpected error loading state file'
      );
      throw error;
    }
  }

  private saveState(state: WorkspaceState): void {
    try {
      workspaceConfig.ensureChorenzoDir();
      const sortedState = this.sortStateKeys(state);
      const content = JSON.stringify(sortedState, null, 2);
      writeFileAtomic.sync(this.statePath, content, { mode: 0o600 });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      Logger.error(
        {
          event: 'SECURITY_ATOMIC_WRITE_FAILED',
          statePath: path.relative(process.cwd(), this.statePath),
          error: errorMessage,
        },
        'Atomic write operation failed - potential security implications'
      );
      throw new StateManagerError(
        `Failed to save state: ${errorMessage}`,
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
      Logger.error(
        {
          event: 'SECURITY_STATE_STRUCTURE_VALIDATION_FAILED',
          reason: 'invalid_root_object',
          dataType: typeof data,
          isArray: Array.isArray(data),
        },
        'State structure validation failed - invalid root object structure'
      );
      throw new StateManagerError(
        'Invalid state structure: expected object with workspace and projects properties',
        'INVALID_STATE_STRUCTURE'
      );
    }

    const state = data as Record<string, unknown>;

    if (state.workspace !== undefined && typeof state.workspace !== 'object') {
      Logger.error(
        {
          event: 'SECURITY_STATE_STRUCTURE_VALIDATION_FAILED',
          reason: 'invalid_workspace_type',
          workspaceType: typeof state.workspace,
        },
        'State structure validation failed - workspace property is not an object'
      );
      throw new StateManagerError(
        'Invalid state structure: workspace must be an object',
        'INVALID_WORKSPACE_STRUCTURE'
      );
    }

    if (state.projects !== undefined && typeof state.projects !== 'object') {
      Logger.error(
        {
          event: 'SECURITY_STATE_STRUCTURE_VALIDATION_FAILED',
          reason: 'invalid_projects_type',
          projectsType: typeof state.projects,
        },
        'State structure validation failed - projects property is not an object'
      );
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
      (typeof state.workspace !== 'object' ||
        Array.isArray(state.workspace) ||
        state.workspace === null)
    ) {
      return false;
    }

    if (
      state.projects !== undefined &&
      (typeof state.projects !== 'object' ||
        Array.isArray(state.projects) ||
        state.projects === null)
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
        const errorMessage =
          error instanceof Error ? error.message : 'Path validation failed';
        Logger.error(
          {
            event: 'SECURITY_PATH_TRAVERSAL_BLOCKED',
            projectPath: path.relative(process.cwd(), projectPath),
            recipeName,
            operation: 'recipe_check',
            error: errorMessage,
          },
          'Blocked potential path traversal attempt in recipe applied check'
        );
        throw new StateManagerError(
          `Invalid project path: ${errorMessage}`,
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
