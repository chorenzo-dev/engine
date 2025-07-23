import { simpleGit } from 'simple-git';

export class GitError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'GitError';
  }
}

export async function checkGitAvailable(): Promise<void> {
  const git = simpleGit();

  try {
    await git.raw(['--version']);
  } catch {
    throw new GitError(
      'Git is not installed or not available in PATH. Please install Git first.',
      'GIT_NOT_FOUND'
    );
  }
}

export async function cloneRepository(
  repoUrl: string,
  targetPath: string,
  ref: string
): Promise<void> {
  const git = simpleGit();
  await git.clone(repoUrl, targetPath, ['--depth', '1', '--branch', ref]);
}
