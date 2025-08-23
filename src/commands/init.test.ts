import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { stringify as yamlStringify } from 'yaml';

const mockHomedir = jest.fn<() => string>(() => '/test/home');
const mockTmpdir = jest.fn<() => string>(() => '/tmp');
const mockMkdirSync =
  jest.fn<(path: string, options?: { recursive?: boolean }) => void>();
const mockExistsSync = jest.fn<(path: string) => boolean>();
const mockRmSync =
  jest.fn<
    (path: string, options?: { recursive?: boolean; force?: boolean }) => void
  >();
const mockUnlinkSync = jest.fn<(path: string) => void>();
const mockReadFileSync = jest.fn<(path: string, encoding?: string) => string>();
const mockWriteFileSync =
  jest.fn<(path: string, data: string, encoding?: string) => void>();
const mockClone =
  jest.fn<(repo: string, path: string, options?: unknown) => Promise<void>>();
const mockRaw = jest.fn<(args: string[]) => Promise<string>>();
const mockQuery = jest.fn<() => AsyncGenerator<unknown, void, unknown>>();
const mockSpawnSync = jest.fn<
  () => {
    error?: Error;
    status: number;
    stdout?: string;
    stderr?: string;
    signal?: string;
  }
>();
jest.unstable_mockModule('os', () => ({
  homedir: mockHomedir,
  tmpdir: mockTmpdir,
}));

jest.unstable_mockModule('fs', () => ({
  mkdirSync: mockMkdirSync,
  existsSync: mockExistsSync,
  rmSync: mockRmSync,
  unlinkSync: mockUnlinkSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}));

jest.unstable_mockModule('simple-git', () => ({
  simpleGit: jest.fn(() => ({
    clone: mockClone,
    raw: mockRaw,
  })),
}));

jest.unstable_mockModule('child_process', () => ({
  spawnSync: mockSpawnSync,
}));

jest.unstable_mockModule('@anthropic-ai/claude-code', () => ({
  query: mockQuery,
}));

describe('Init Command Integration Tests', () => {
  let performInit: typeof import('./init').performInit;
  let mockProgress: jest.Mock;

  const setupDefaultMocks = () => {
    mockHomedir.mockImplementation(() => '/test/home');
    mockTmpdir.mockImplementation(() => '/tmp');
    mockMkdirSync.mockImplementation(() => undefined);
    mockExistsSync.mockImplementation(() => false);
    mockRmSync.mockImplementation(() => undefined);
    mockUnlinkSync.mockImplementation(() => undefined);
    const defaultConfig = {
      libraries: {
        core: {
          repo: 'https://github.com/chorenzo-dev/recipes-core.git',
          ref: 'main',
        },
      },
    };

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('config.yaml')) {
        return yamlStringify(defaultConfig);
      }
      if (filePath.includes('.json')) {
        return '{}';
      }
      return 'mock file content';
    });
    mockWriteFileSync.mockImplementation(() => undefined);
    mockClone.mockImplementation(() => Promise.resolve());
    mockRaw.mockImplementation(() => Promise.resolve('git version 2.0.0'));
    mockQuery.mockImplementation(async function* () {
      await Promise.resolve();
      yield { type: 'result', is_error: false };
    });
    mockSpawnSync.mockImplementation(() => ({
      status: 0,
      stdout: 'Claude CLI is working',
      stderr: '',
    }));
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    setupDefaultMocks();
    mockProgress = jest.fn();

    jest.resetModules();
    const initModule = await import('./init');
    performInit = initModule.performInit;
  });

  it('should create chorenzo directory structure', async () => {
    await performInit({});

    expect(mockMkdirSync).toHaveBeenCalledWith('/test/home/.chorenzo/recipes', {
      recursive: true,
    });
  });

  it('should create config.yaml with default configuration', async () => {
    await performInit({});

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/test/home/.chorenzo/config.yaml',
      expect.stringContaining('libraries:'),
      'utf8'
    );
  });

  it('should not overwrite existing config files', async () => {
    mockExistsSync.mockImplementation((filePath: string) => {
      return filePath.includes('config.yaml');
    });

    await performInit({});

    const configCalls = mockWriteFileSync.mock.calls.filter((call) =>
      call[0].includes('config.yaml')
    );
    expect(configCalls).toHaveLength(0);
  });

  it('should reset workspace when reset option is provided', async () => {
    let unlinkCalls = 0;
    mockExistsSync.mockImplementation((filePath: string) => {
      if (filePath.includes('recipes')) {
        return true;
      }
      if (filePath.includes('config.yaml')) {
        return unlinkCalls < 1;
      }
      return false;
    });

    mockUnlinkSync.mockImplementation(() => {
      unlinkCalls++;
    });

    await performInit({ reset: true });

    expect(mockRmSync).toHaveBeenCalledWith('/test/home/.chorenzo/recipes', {
      recursive: true,
      force: true,
    });
    expect(mockUnlinkSync).toHaveBeenCalledWith(
      '/test/home/.chorenzo/config.yaml'
    );
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/test/home/.chorenzo/config.yaml',
      expect.stringContaining('libraries:'),
      'utf8'
    );
  });

  it('should skip cloning if library directory already exists', async () => {
    mockExistsSync.mockImplementation((filePath: string) => {
      return filePath.includes('/core');
    });

    await performInit({}, mockProgress);

    expect(mockProgress).toHaveBeenCalledWith('Skipping core (already exists)');
    expect(mockClone).not.toHaveBeenCalled();
  });

  it('should handle git clone failures gracefully', async () => {
    mockClone.mockImplementation(() =>
      Promise.reject(new Error('Network error'))
    );

    await performInit({}, mockProgress);

    expect(mockProgress).toHaveBeenCalledWith(
      'Warning: Failed to clone core after retry, skipping'
    );
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/test/home/.chorenzo/config.yaml',
      expect.stringContaining('libraries:'),
      'utf8'
    );
  });

  it('should handle running init twice without errors', async () => {
    await performInit({});

    jest.clearAllMocks();
    setupDefaultMocks();
    mockExistsSync.mockImplementation((filePath: string) => {
      return filePath.includes('/core') || filePath.includes('config.yaml');
    });

    await expect(performInit({}, mockProgress)).resolves.not.toThrow();

    expect(mockProgress).toHaveBeenCalledWith('Skipping core (already exists)');
    expect(mockClone).not.toHaveBeenCalled();
  });

  it('should handle corrupted workspace state and recreate missing components', async () => {
    mockExistsSync.mockImplementation((filePath: string) => {
      if (filePath.includes('config.yaml')) {
        return true;
      }
      if (filePath.includes('/core')) {
        return false;
      }
      return false;
    });

    await performInit({}, mockProgress);

    expect(mockMkdirSync).toHaveBeenCalledWith('/test/home/.chorenzo/recipes', {
      recursive: true,
    });
    expect(mockWriteFileSync).not.toHaveBeenCalledWith(
      '/test/home/.chorenzo/config.yaml',
      expect.stringContaining('libraries:'),
      'utf8'
    );
    expect(mockClone).toHaveBeenCalled();
    expect(mockProgress).toHaveBeenCalledWith('Creating directory structure');
    expect(mockProgress).toHaveBeenCalledWith('Setting up configuration files');
  });

  it('should handle permission errors during directory creation', async () => {
    mockMkdirSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    await expect(performInit({})).rejects.toThrow('EACCES: permission denied');
  });

  it('should handle invalid config YAML file', async () => {
    mockExistsSync.mockImplementation((filePath: string) => {
      return filePath.includes('config.yaml');
    });

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('config.yaml')) {
        return 'invalid: yaml: content: [unclosed';
      }
      return 'mock file content';
    });

    await expect(performInit({})).rejects.toThrow();
  });

  it('should handle writeFileSync failures', async () => {
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('ENOSPC: no space left on device');
    });

    await expect(performInit({})).rejects.toThrow(
      'ENOSPC: no space left on device'
    );
  });

  it('should complete initialization workflow successfully', async () => {
    setupDefaultMocks();

    await expect(performInit({}, mockProgress)).resolves.not.toThrow();
    expect(mockProgress).toHaveBeenCalledWith('Creating directory structure');
    expect(mockProgress).toHaveBeenCalledWith('Setting up configuration files');
    expect(mockProgress).toHaveBeenCalledWith('Validating configuration');
  });

  it('should create proper gitignore patterns without end marker', async () => {
    await performInit({});

    const gitignoreCalls = mockWriteFileSync.mock.calls.filter((call) =>
      call[0].includes('.gitignore')
    );
    expect(gitignoreCalls).toHaveLength(1);

    const gitignoreContent = gitignoreCalls[0]?.[1] as string;
    expect(gitignoreContent).toContain('# Chorenzo');
    expect(gitignoreContent).toContain('/.chorenzo/*');
    expect(gitignoreContent).toContain('!/.chorenzo/state.json');
    expect(gitignoreContent).toContain('!/.chorenzo/analysis.json');
  });

  it('should update existing gitignore patterns correctly', async () => {
    mockExistsSync.mockImplementation((filePath: string) => {
      return (
        filePath.includes('.gitignore') || filePath.includes('config.yaml')
      );
    });

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('.gitignore')) {
        return `# Some existing content
node_modules/
        
# Chorenzo
/.chorenzo/*
!/.chorenzo/state.json

# More content`;
      }
      return 'libraries:\n  core:\n    url: git@github.com:chorenzo/recipes-core.git';
    });

    await performInit({});

    const gitignoreCalls = mockWriteFileSync.mock.calls.filter((call) =>
      call[0].includes('.gitignore')
    );
    expect(gitignoreCalls).toHaveLength(1);

    const gitignoreContent = gitignoreCalls[0]?.[1] as string;
    expect(gitignoreContent).toContain('# Some existing content');
    expect(gitignoreContent).toContain('# Chorenzo');
    expect(gitignoreContent).toContain('/.chorenzo/*');
    expect(gitignoreContent).toContain('!/.chorenzo/state.json');
    expect(gitignoreContent).toContain('!/.chorenzo/analysis.json');
    expect(gitignoreContent).toContain('# More content');
  });
});
