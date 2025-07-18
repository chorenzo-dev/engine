import { jest } from '@jest/globals';

export function mockGitOperations(remoteUrl: string = 'https://github.com/test/repo.git') {
  const mockGit = {
    clone: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    raw: jest.fn<() => Promise<string>>().mockResolvedValue('git version 2.39.0')
  };

  jest.doMock('simple-git', () => ({
    simpleGit: jest.fn(() => mockGit)
  }));

  jest.doMock('../utils/git.utils', () => ({
    findGitRoot: jest.fn<() => Promise<string>>().mockResolvedValue('/workspace/test-project'),
    parseGitConfig: jest.fn<() => Promise<string>>().mockResolvedValue(remoteUrl),
    normalizeRepoIdentifier: jest.fn((url: string) => 'test/repo'),
    getProjectIdentifier: jest.fn<() => Promise<{identifier: string; type: string}>>().mockResolvedValue({
      identifier: 'test/repo',
      type: 'remote'
    })
  }));

  jest.doMock('../utils/git-operations.utils', () => ({
    checkGitAvailable: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    cloneRepository: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    GitError: class GitError extends Error {
      constructor(message: string, public readonly code: string) {
        super(message);
        this.name = 'GitError';
      }
    }
  }));

  return mockGit;
}