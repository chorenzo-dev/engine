import { jest } from '@jest/globals';

export function mockGitOperations(remoteUrl: string = 'https://github.com/test/repo.git') {
  const mockGit = {
    clone: jest.fn().mockResolvedValue(undefined),
    raw: jest.fn().mockResolvedValue('git version 2.39.0')
  };

  jest.doMock('simple-git', () => ({
    simpleGit: jest.fn(() => mockGit)
  }));

  jest.doMock('../utils/git.utils', () => ({
    findGitRoot: jest.fn().mockResolvedValue('/workspace/test-project'),
    parseGitConfig: jest.fn().mockResolvedValue(remoteUrl),
    normalizeRepoIdentifier: jest.fn((url: string) => 'test/repo'),
    getProjectIdentifier: jest.fn().mockResolvedValue({
      identifier: 'test/repo',
      type: 'remote'
    })
  }));

  jest.doMock('../utils/git-operations.utils', () => ({
    checkGitAvailable: jest.fn().mockResolvedValue(undefined),
    cloneRepository: jest.fn().mockResolvedValue(undefined)
  }));

  return mockGit;
}