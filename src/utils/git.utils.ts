import * as fs from 'fs/promises';
import * as path from 'path';

export interface ProjectIdentifier {
  identifier: string;
  type: 'remote' | 'local';
}

export async function findGitRoot(
  startPath: string = process.cwd()
): Promise<string> {
  let currentPath = path.resolve(startPath);

  while (currentPath !== path.dirname(currentPath)) {
    const gitPath = path.join(currentPath, '.git');

    try {
      const stat = await fs.stat(gitPath);
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

  throw new Error(
    'Not a git repository. Chorenzo requires a git repository to work.'
  );
}

export async function parseGitConfig(gitRoot: string): Promise<string | null> {
  const gitPath = path.join(gitRoot, '.git');
  let gitConfigPath: string;
  
  try {
    const stat = await fs.stat(gitPath);
    if (stat.isFile()) {
      const gitFileContent = await fs.readFile(gitPath, 'utf-8');
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
    const configContent = await fs.readFile(gitConfigPath, 'utf-8');

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

export async function getProjectIdentifier(): Promise<ProjectIdentifier> {
  const gitRoot = await findGitRoot();

  const remoteUrl = await parseGitConfig(gitRoot);

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