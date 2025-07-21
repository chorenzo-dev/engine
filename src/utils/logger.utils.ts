import pino from 'pino';
import * as fs from 'fs';
import * as path from 'path';
import { workspaceConfig } from './workspace-config.utils';

let applyLogger: pino.Logger | null = null;
const MAX_LOG_SIZE_MB = 10;

async function rotateLogIfNeeded(logPath: string): Promise<void> {
  if (!fs.existsSync(logPath)) {
    return;
  }
  
  const stats = fs.statSync(logPath);
  const fileSizeMB = stats.size / (1024 * 1024);
  
  if (fileSizeMB > MAX_LOG_SIZE_MB) {
    const archivedPath = await workspaceConfig.getArchivedLogPath();
    fs.renameSync(logPath, archivedPath);
  }
}

export async function createApplyLogger(recipeId: string, projectPath: string): Promise<pino.Logger> {
  const logPath = await workspaceConfig.getLogPath();
  
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  
  await rotateLogIfNeeded(logPath);
  
  const logStream = pino.transport({
    target: 'pino-pretty',
    options: {
      destination: logPath,
      colorize: false,
      translateTime: 'yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname',
      append: true
    }
  });

  applyLogger = pino({
    level: 'info'
  }, logStream);

  applyLogger.info({
    event: 'apply_started',
    recipe: recipeId,
    project: projectPath
  }, `Recipe application started: ${recipeId} → ${projectPath}`);

  return applyLogger;
}

export function getApplyLogger(): pino.Logger {
  if (!applyLogger) {
    throw new Error('Apply logger not initialized. Call createApplyLogger first.');
  }
  return applyLogger;
}

export function closeApplyLogger(): void {
  if (applyLogger) {
    applyLogger.info({ event: 'apply_completed' }, 'Recipe application completed');
    applyLogger = null;
  }
}