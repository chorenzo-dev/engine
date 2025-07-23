import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Config, State } from './init';

const mockHomedir = jest.fn<() => string>(() => '/test/home');
const mockMkdirSync = jest.fn<(path: string, options?: any) => void>();
const mockExistsSync = jest.fn<(path: string) => boolean>();
const mockRmSync = jest.fn<(path: string, options?: any) => void>();
const mockUnlinkSync = jest.fn<(path: string) => void>();
const mockWriteYaml = jest.fn<(path: string, data: any) => Promise<void>>();
const mockReadYaml = jest.fn<(path: string) => Promise<any>>();
const mockWriteJson = jest.fn<(path: string, data: any) => Promise<void>>();
const mockReadJson = jest.fn<(path: string) => Promise<any>>();
const mockCheckGitAvailable = jest.fn<() => Promise<void>>();
const mockCloneRepository =
  jest.fn<(repo: string, path: string, ref: string) => Promise<void>>();

jest.unstable_mockModule('os', () => ({
  homedir: mockHomedir,
  tmpdir: jest.fn(() => '/tmp'),
}));

jest.unstable_mockModule('fs', () => ({
  mkdirSync: mockMkdirSync,
  existsSync: mockExistsSync,
  rmSync: mockRmSync,
  unlinkSync: mockUnlinkSync,
}));

jest.unstable_mockModule('../utils/yaml.utils', () => ({
  writeYaml: mockWriteYaml,
  readYaml: mockReadYaml,
  YamlError: class YamlError extends Error {
    constructor(
      message: string,
      public readonly code: string
    ) {
      super(message);
      this.name = 'YamlError';
    }
  },
}));

jest.unstable_mockModule('../utils/json.utils', () => ({
  writeJson: mockWriteJson,
  readJson: mockReadJson,
}));

jest.unstable_mockModule('../utils/git-operations.utils', () => ({
  checkGitAvailable: mockCheckGitAvailable,
  cloneRepository: mockCloneRepository,
  GitError: class GitError extends Error {
    constructor(
      message: string,
      public readonly code: string
    ) {
      super(message);
      this.name = 'GitError';
    }
  },
}));

describe('Init Command Integration Tests', () => {
  let performInit: typeof import('./init').performInit;

  const setupDefaultMocks = () => {
    mockHomedir.mockImplementation(() => '/test/home');
    mockMkdirSync.mockImplementation(() => undefined);
    mockExistsSync.mockImplementation(() => false);
    mockRmSync.mockImplementation(() => undefined);
    mockUnlinkSync.mockImplementation(() => undefined);
    mockWriteYaml.mockImplementation(() => Promise.resolve(undefined));
    mockReadYaml.mockImplementation(() =>
      Promise.resolve({
        libraries: {
          core: {
            repo: 'https://github.com/chorenzo-dev/recipes-core.git',
            ref: 'main',
          },
        },
      })
    );
    mockWriteJson.mockImplementation(() => Promise.resolve(undefined));
    mockReadJson.mockImplementation(() => Promise.resolve({}));
    mockCheckGitAvailable.mockImplementation(() => Promise.resolve(undefined));
    mockCloneRepository.mockImplementation(() => Promise.resolve(undefined));
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    setupDefaultMocks();

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

    expect(mockWriteYaml).toHaveBeenCalledWith(
      '/test/home/.chorenzo/config.yaml',
      {
        libraries: {
          core: {
            repo: 'https://github.com/chorenzo-dev/recipes-core.git',
            ref: 'main',
          },
        },
      }
    );
  });

  it('should create state.json with default state', async () => {
    await performInit({});

    expect(mockWriteJson).toHaveBeenCalledWith(
      '/test/home/.chorenzo/state.json',
      {
        last_checked: '1970-01-01T00:00:00Z',
      }
    );
  });

  it('should not overwrite existing config files', async () => {
    mockExistsSync.mockImplementation((filePath: string) => {
      return (
        filePath.includes('config.yaml') || filePath.includes('state.json')
      );
    });

    await performInit({});

    expect(mockWriteYaml).toHaveBeenCalledTimes(0);
    expect(mockWriteJson).toHaveBeenCalledTimes(0);
  });

  it('should reset workspace when reset option is provided', async () => {
    let unlinkCalls = 0;
    mockExistsSync.mockImplementation((filePath: string) => {
      if (filePath.includes('recipes')) return true;
      if (filePath.includes('config.yaml') || filePath.includes('state.json')) {
        return unlinkCalls < 2;
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
    expect(mockUnlinkSync).toHaveBeenCalledWith(
      '/test/home/.chorenzo/state.json'
    );
    expect(mockWriteYaml).toHaveBeenCalledWith(
      '/test/home/.chorenzo/config.yaml',
      expect.any(Object)
    );
    expect(mockWriteJson).toHaveBeenCalledWith(
      '/test/home/.chorenzo/state.json',
      expect.any(Object)
    );
  });

  it('should skip cloning if library directory already exists', async () => {
    mockExistsSync.mockImplementation((filePath: string) => {
      return filePath.includes('/core');
    });

    const mockProgress = jest.fn();
    await performInit({}, mockProgress);

    expect(mockProgress).toHaveBeenCalledWith('Skipping core (already exists)');
    expect(mockCloneRepository).not.toHaveBeenCalled();
  });

  it('should handle git clone failures gracefully', async () => {
    mockCloneRepository.mockImplementation(() =>
      Promise.reject(new Error('Network error'))
    );

    const mockProgress = jest.fn();
    await performInit({}, mockProgress);

    expect(mockProgress).toHaveBeenCalledWith(
      'Warning: Failed to clone core after retry, skipping...'
    );
    expect(mockWriteYaml).toHaveBeenCalledWith(
      '/test/home/.chorenzo/config.yaml',
      expect.any(Object)
    );
  });

  it('should handle running init twice without errors', async () => {
    await performInit({});

    jest.clearAllMocks();
    setupDefaultMocks();
    mockExistsSync.mockImplementation((filePath: string) => {
      return (
        filePath.includes('/core') ||
        filePath.includes('config.yaml') ||
        filePath.includes('state.yaml')
      );
    });

    const mockProgress = jest.fn();
    await expect(performInit({}, mockProgress)).resolves.not.toThrow();

    expect(mockProgress).toHaveBeenCalledWith('Skipping core (already exists)');
    expect(mockWriteYaml).not.toHaveBeenCalled();
    expect(mockCloneRepository).not.toHaveBeenCalled();
  });

  it('should handle corrupted workspace state and recreate missing components', async () => {
    mockExistsSync.mockImplementation((filePath: string) => {
      if (filePath.includes('config.yaml')) return true;
      if (filePath.includes('state.yaml')) return false;
      if (filePath.includes('/core')) return false;
      return false;
    });

    const mockProgress = jest.fn();
    await performInit({}, mockProgress);

    expect(mockMkdirSync).toHaveBeenCalledWith('/test/home/.chorenzo/recipes', {
      recursive: true,
    });
    expect(mockWriteJson).toHaveBeenCalledWith(
      '/test/home/.chorenzo/state.json',
      expect.any(Object)
    );
    expect(mockWriteYaml).not.toHaveBeenCalledWith(
      '/test/home/.chorenzo/config.yaml',
      expect.any(Object)
    );
    expect(mockCloneRepository).toHaveBeenCalled();
    expect(mockProgress).toHaveBeenCalledWith(
      'Creating directory structure...'
    );
    expect(mockProgress).toHaveBeenCalledWith(
      'Setting up configuration files...'
    );
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

    const YamlError = (await import('../utils/yaml.utils')).YamlError;
    mockReadYaml.mockImplementation(() => {
      throw new YamlError('Invalid YAML syntax', 'YAML_PARSE_ERROR');
    });

    await expect(performInit({})).rejects.toThrow('Invalid YAML syntax');
  });

  it('should handle writeYaml failures', async () => {
    mockWriteYaml.mockImplementation(() => {
      throw new Error('ENOSPC: no space left on device');
    });

    await expect(performInit({})).rejects.toThrow(
      'ENOSPC: no space left on device'
    );
  });
});
