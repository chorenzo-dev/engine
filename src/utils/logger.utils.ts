import * as fs from 'fs';
import * as path from 'path';
import pino from 'pino';

import { workspaceConfig } from './workspace-config.utils';

class Logger {
  private static instance: pino.Logger | null = null;
  private static readonly MAX_LOG_SIZE_MB = 10;

  private static rotateLogIfNeeded(logPath: string): void {
    if (!fs.existsSync(logPath)) {
      return;
    }

    const stats = fs.statSync(logPath);
    const fileSizeMB = stats.size / (1024 * 1024);

    if (fileSizeMB > this.MAX_LOG_SIZE_MB) {
      const archivedPath = workspaceConfig.getArchivedLogPath();
      fs.renameSync(logPath, archivedPath);
    }
  }

  private static initialize(): void {
    if (this.instance) {
      return;
    }

    const isTest =
      process.env['NODE_ENV'] === 'test' ||
      process.env['JEST_WORKER_ID'] !== undefined;

    if (isTest) {
      this.instance = pino({ level: 'silent' });
      return;
    }

    try {
      const logPath = workspaceConfig.getLogPath();
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      this.rotateLogIfNeeded(logPath);

      const logStream = pino.transport({
        target: 'pino-pretty',
        options: {
          destination: logPath,
          colorize: false,
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
          append: true,
        },
      });

      this.instance = pino(
        {
          level: process.env['DEBUG'] ? 'debug' : 'info',
        },
        logStream
      );
    } catch (error) {
      throw new Error(
        `Failed to initialize Logger: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private static getInstance(): pino.Logger {
    if (!this.instance) {
      this.initialize();
    }
    if (!this.instance) {
      throw new Error('Failed to initialize logger instance');
    }
    return this.instance;
  }

  static debug(obj: unknown, msg?: string): void {
    this.getInstance().debug(obj, msg);
  }

  static info(obj: unknown, msg?: string): void {
    this.getInstance().info(obj, msg);
  }

  static warn(obj: unknown, msg?: string): void {
    this.getInstance().warn(obj, msg);
  }

  static error(obj: unknown, msg?: string): void {
    this.getInstance().error(obj, msg);
  }
}

export { Logger };
