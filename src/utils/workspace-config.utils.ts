import * as fs from 'fs';
import * as path from 'path';

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

  getWorkspaceRoot(): string {
    if (!this.workspaceRoot) {
      this.workspaceRoot = findGitRoot();
    }
    return this.workspaceRoot;
  }

  getChorenzoDir(): string {
    const root = this.getWorkspaceRoot();
    return path.join(root, '.chorenzo');
  }

  getAnalysisPath(): string {
    const chorenzoDir = this.getChorenzoDir();
    return path.join(chorenzoDir, 'analysis.json');
  }

  getStatePath(): string {
    const chorenzoDir = this.getChorenzoDir();
    return path.join(chorenzoDir, 'state.json');
  }

  getLogsDir(): string {
    const chorenzoDir = this.getChorenzoDir();
    return path.join(chorenzoDir, 'logs');
  }

  getLogPath(): string {
    const logsDir = this.getLogsDir();
    return path.join(logsDir, 'chorenzo.log');
  }

  getArchivedLogPath(): string {
    const logsDir = this.getLogsDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(logsDir, `chorenzo-${timestamp}.log`);
  }

  ensureChorenzoDir(): void {
    const chorenzoDir = this.getChorenzoDir();
    fs.mkdirSync(chorenzoDir, { recursive: true });
  }
}

export const workspaceConfig = WorkspaceConfig.getInstance();
