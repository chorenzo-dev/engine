import * as path from 'path';
import * as fs from 'fs';
import { Logger } from './logger.utils';

function matchGitIgnorePattern(filePath: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\*\*/g, '.*');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath) || regex.test(path.basename(filePath));
}

export function loadGitIgnorePatternsForDir(
  directory: string,
  parentPatterns: Set<string>
): Set<string> {
  const patterns = new Set(parentPatterns);
  const gitignorePath = path.join(directory, '.gitignore');

  if (fs.existsSync(gitignorePath)) {
    try {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      const lines = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));

      for (const line of lines) {
        patterns.add(line);
      }
    } catch (error) {
      Logger.warn(
        {
          event: 'gitignore_read_failed',
          path: gitignorePath,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to read .gitignore file'
      );
    }
  }

  return patterns;
}

export function isIgnored(
  filePath: string,
  rootDir: string,
  ignorePatterns: Set<string>
): boolean {
  const relPath = path.relative(rootDir, filePath);
  const parts = relPath.split(path.sep);

  for (const pattern of ignorePatterns) {
    if (
      matchGitIgnorePattern(relPath, pattern) ||
      relPath.startsWith(pattern) ||
      parts.includes(pattern)
    ) {
      return true;
    }
  }

  return false;
}
