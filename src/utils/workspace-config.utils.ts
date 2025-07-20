import * as path from 'path';
import * as fs from 'fs';
import { findGitRoot } from './git.utils';

export class WorkspaceConfig {
  private static instance: WorkspaceConfig | null = null;
  private workspaceRoot: string | null = null;

  private constructor() {}

  static getInstance(): WorkspaceConfig {
    if (!WorkspaceConfig.instance) {
      WorkspaceConfig.instance = new WorkspaceConfig();
    }
    return WorkspaceConfig.instance;
  }

  async getWorkspaceRoot(): Promise<string> {
    if (!this.workspaceRoot) {
      this.workspaceRoot = await findGitRoot().catch(() => process.cwd());
    }
    return this.workspaceRoot;
  }

  async getChorenzoDir(): Promise<string> {
    const root = await this.getWorkspaceRoot();
    return path.join(root, '.chorenzo');
  }

  async getAnalysisPath(): Promise<string> {
    const chorenzoDir = await this.getChorenzoDir();
    return path.join(chorenzoDir, 'analysis.json');
  }

  async getStatePath(): Promise<string> {
    const chorenzoDir = await this.getChorenzoDir();
    return path.join(chorenzoDir, 'state.json');
  }

  async getPlansDir(): Promise<string> {
    const chorenzoDir = await this.getChorenzoDir();
    return path.join(chorenzoDir, 'plans');
  }

  async getLogsDir(): Promise<string> {
    const chorenzoDir = await this.getChorenzoDir();
    return path.join(chorenzoDir, 'logs');
  }

  async getPlanPath(projectPath: string, recipeId: string): Promise<string> {
    const plansDir = await this.getPlansDir();
    const normalizedProjectPath = projectPath === '.' ? 'workspace' : projectPath;
    return path.join(plansDir, normalizedProjectPath, `${recipeId}.plan.md`);
  }

  async getLogPath(): Promise<string> {
    const logsDir = await this.getLogsDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(logsDir, `${timestamp}.log`);
  }

  async ensureChorenzoDir(): Promise<void> {
    const chorenzoDir = await this.getChorenzoDir();
    fs.mkdirSync(chorenzoDir, { recursive: true });
  }
}

export const workspaceConfig = WorkspaceConfig.getInstance();