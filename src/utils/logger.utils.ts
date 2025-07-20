import pino from 'pino';
import * as fs from 'fs';
import * as path from 'path';
import { workspaceConfig } from './workspace-config.utils';

let applyLogger: pino.Logger | null = null;

export async function createApplyLogger(recipeId: string, projectPath: string): Promise<pino.Logger> {
  const logPath = await workspaceConfig.getLogPath();
  
  // Ensure log directory exists
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  
  const logStream = fs.createWriteStream(logPath, { flags: 'w' });
  
  applyLogger = pino({
    level: 'debug',
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  }, logStream);

  applyLogger.info({
    event: 'apply_started',
    recipe: recipeId,
    project: projectPath,
    timestamp: new Date().toISOString()
  }, 'Recipe application started');

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