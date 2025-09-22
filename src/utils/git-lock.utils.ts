import * as fs from 'fs';
import * as path from 'path';

import { Logger } from './logger.utils';

export class GitLockManager {
  private static readonly locks = new Map<string, Promise<void>>();
  private static readonly STALE_LOCK_THRESHOLD_MS = 60000;

  static async withLock<T>(
    repoPath: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const lockKey = path.normalize(repoPath);

    this.cleanupStaleLockFile(repoPath);

    const existingLock = this.locks.get(lockKey);
    if (existingLock) {
      Logger.debug(
        { repoPath },
        'Waiting for existing git operation to complete'
      );
      await existingLock;
    }

    let lockResolve: (() => void) | undefined;
    const lockPromise = new Promise<void>((resolve) => {
      lockResolve = resolve;
    });

    this.locks.set(lockKey, lockPromise);

    try {
      const result = await operation();
      return result;
    } finally {
      if (lockResolve) {
        lockResolve();
      }

      if (this.locks.get(lockKey) === lockPromise) {
        this.locks.delete(lockKey);
      }
    }
  }

  private static cleanupStaleLockFile(repoPath: string): void {
    const gitDir = path.join(repoPath, '.git');
    const indexLockPath = path.join(gitDir, 'index.lock');

    if (!fs.existsSync(indexLockPath)) {
      return;
    }

    try {
      const stats = fs.statSync(indexLockPath);
      const ageMs = Date.now() - stats.mtimeMs;

      if (ageMs > this.STALE_LOCK_THRESHOLD_MS) {
        Logger.warn(
          {
            repoPath,
            lockAge: `${Math.round(ageMs / 1000)}s`,
          },
          'Removing stale git index.lock file'
        );
        fs.unlinkSync(indexLockPath);
      }
    } catch (error) {
      Logger.debug(
        { repoPath, error },
        'Could not check or remove git index.lock file'
      );
    }
  }
}
