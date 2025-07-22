import * as fs from 'fs';
import * as path from 'path';

export interface ProjectIdentifier {
  identifier: string;
  type: 'remote' | 'local';
}

export function findGitRoot(
  startPath: string = process.cwd()
): string {
  let currentPath = path.resolve(startPath);

  while (currentPath !== path.dirname(currentPath)) {
    const gitPath = path.join(currentPath, '.git');

    try {
      const stat = fs.statSync(gitPath);
      if (stat.isDirectory() || stat.isFile()) {
        return currentPath;
      }
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code !== 'ENOENT'
      ) {
        throw error;
      }
    }

    currentPath = path.dirname(currentPath);
  }

  return process.cwd();
}

export function parseGitConfig(gitRoot: string): string | null {
  const gitPath = path.join(gitRoot, '.git');
  let gitConfigPath: string;
  
  try {
    const stat = fs.statSync(gitPath);
    if (stat.isFile()) {
      const gitFileContent = fs.readFileSync(gitPath, 'utf-8');
      const gitDirMatch = gitFileContent.match(/gitdir:\s*(.+)/);
      if (gitDirMatch) {
        const gitDir = gitDirMatch[1].trim();
        gitConfigPath = path.join(gitDir, 'config');
      } else {
        gitConfigPath = path.join(gitRoot, '.git', 'config');
      }
    } else {
      gitConfigPath = path.join(gitRoot, '.git', 'config');
    }
  } catch {
    gitConfigPath = path.join(gitRoot, '.git', 'config');
  }

  try {
    const configContent = fs.readFileSync(gitConfigPath, 'utf-8');

    const lines = configContent.split('\n');
    let inOriginSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === '[remote "origin"]') {
        inOriginSection = true;
        continue;
      }

      if (trimmed.startsWith('[') && trimmed !== '[remote "origin"]') {
        inOriginSection = false;
        continue;
      }

      if (inOriginSection && trimmed.startsWith('url =')) {
        const url = trimmed.replace('url =', '').trim();
        return url;
      }
    }

    return null;
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null;
    }
    throw error;
  }
}

export function normalizeRepoIdentifier(gitUrl: string): string {
  let normalized = gitUrl;

  if (normalized.startsWith('git@')) {
    normalized = normalized
      .replace(/^git@([^:]+):/, '$1/')
      .replace(/\.git$/, '');
  } else {
    normalized = normalized.replace(/^https?:\/\//, '').replace(/\.git$/, '');
  }

  const match = normalized.match(/([^/]+)\/([^/]+\/[^/]+)$/);
  if (match) {
    const [, , userRepo] = match;
    return userRepo;
  }

  return normalized;
}

export function getProjectIdentifier(): ProjectIdentifier {
  const gitRoot = findGitRoot();

  const remoteUrl = parseGitConfig(gitRoot);

  if (remoteUrl) {
    return {
      identifier: normalizeRepoIdentifier(remoteUrl),
      type: 'remote',
    };
  }

  return {
    identifier: gitRoot,
    type: 'local',
  };
}