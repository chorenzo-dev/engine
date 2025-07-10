import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { mockGitOperations } from '../test-utils';
import type { Config, State } from './init';

jest.mock('../utils/git-operations.utils');

const mockHomedir = jest.fn(() => '/tmp/test-home');
const mockTmpdir = jest.fn(() => (jest.requireActual('os') as typeof import('os')).tmpdir());

jest.mock('os', () => ({
  homedir: mockHomedir,
  tmpdir: mockTmpdir
}));

describe('Init Command Integration Tests', () => {
  let testHomeDir: string;
  let performInit: typeof import('./init').performInit;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    const realTmpdir = (jest.requireActual('os') as typeof os).tmpdir();
    testHomeDir = fs.mkdtempSync(path.join(realTmpdir, 'chorenzo-test-'));
    
    mockHomedir.mockReturnValue(testHomeDir);
    mockTmpdir.mockReturnValue(realTmpdir);
    
    mockGitOperations();
    
    const initModule = await import('./init');
    performInit = initModule.performInit;
  });

  afterEach(() => {
    if (fs.existsSync(testHomeDir)) {
      fs.rmSync(testHomeDir, { recursive: true, force: true });
    }
  });

  it('should create chorenzo directory structure', async () => {
    await performInit({});
    
    const chorenzoDir = path.join(testHomeDir, '.chorenzo');
    const recipesDir = path.join(chorenzoDir, 'recipes');
    
    expect(fs.existsSync(chorenzoDir)).toBe(true);
    expect(fs.existsSync(recipesDir)).toBe(true);
  });

  it('should create config.yaml with default configuration', async () => {
    await performInit({});
    
    const configPath = path.join(testHomeDir, '.chorenzo', 'config.yaml');
    expect(fs.existsSync(configPath)).toBe(true);
    
    const yamlUtils = await import('../utils/yaml.utils');
    const config = await yamlUtils.readYaml(configPath) as Config;
    
    expect(config).toEqual({
      libraries: {
        core: {
          repo: 'https://github.com/chorenzo-dev/recipes-core.git',
          ref: 'main'
        }
      }
    });
  });

  it('should create state.yaml with default state', async () => {
    await performInit({});
    
    const statePath = path.join(testHomeDir, '.chorenzo', 'state.yaml');
    expect(fs.existsSync(statePath)).toBe(true);
    
    const yamlUtils = await import('../utils/yaml.utils');
    const state = await yamlUtils.readYaml(statePath) as State;
    
    expect(state).toEqual({
      last_checked: '1970-01-01T00:00:00Z'
    });
  });

  it('should not overwrite existing config files', async () => {
    const chorenzoDir = path.join(testHomeDir, '.chorenzo');
    const configPath = path.join(chorenzoDir, 'config.yaml');
    const statePath = path.join(chorenzoDir, 'state.yaml');
    
    fs.mkdirSync(chorenzoDir, { recursive: true });
    
    const customConfig = { libraries: { custom: { repo: 'test', ref: 'test' } } };
    const customState = { last_checked: '2023-01-01T00:00:00Z' };
    
    const yamlUtils = await import('../utils/yaml.utils');
    await yamlUtils.writeYaml(configPath, customConfig);
    await yamlUtils.writeYaml(statePath, customState);
    
    await performInit({});
    
    const resultConfig = await yamlUtils.readYaml(configPath) as Config;
    const resultState = await yamlUtils.readYaml(statePath) as State;
    
    expect(resultConfig).toEqual(customConfig);
    expect(resultState).toEqual(customState);
  });

  it('should reset workspace when reset option is provided', async () => {
    const chorenzoDir = path.join(testHomeDir, '.chorenzo');
    const recipesDir = path.join(chorenzoDir, 'recipes');
    const configPath = path.join(chorenzoDir, 'config.yaml');
    const statePath = path.join(chorenzoDir, 'state.yaml');
    
    fs.mkdirSync(recipesDir, { recursive: true });
    fs.writeFileSync(path.join(recipesDir, 'existing-lib'), 'content');
    fs.writeFileSync(configPath, 'existing config');
    fs.writeFileSync(statePath, 'existing state');
    
    await performInit({ reset: true });
    
    expect(fs.existsSync(path.join(recipesDir, 'existing-lib'))).toBe(false);
    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.existsSync(statePath)).toBe(true);
    
    const yamlUtils = await import('../utils/yaml.utils');
    const config = await yamlUtils.readYaml(configPath) as Config;
    expect(config.libraries.core).toBeDefined();
  });

  it('should skip cloning if library directory already exists', async () => {
    const recipesDir = path.join(testHomeDir, '.chorenzo', 'recipes');
    const coreDir = path.join(recipesDir, 'core');
    
    fs.mkdirSync(coreDir, { recursive: true });
    fs.writeFileSync(path.join(coreDir, 'existing-file'), 'content');
    
    const mockProgress = jest.fn();
    await performInit({}, mockProgress);
    
    expect(mockProgress).toHaveBeenCalledWith('Skipping core (already exists)');
    expect(fs.existsSync(path.join(coreDir, 'existing-file'))).toBe(true);
  });

  it('should handle git clone failures gracefully', async () => {
    const gitOps = await import('../utils/git-operations.utils');
    jest.mocked(gitOps.cloneRepository).mockRejectedValue(new Error('Network error'));
    
    const mockProgress = jest.fn();
    await performInit({}, mockProgress);
    
    expect(mockProgress).toHaveBeenCalledWith(expect.stringContaining('Warning: Failed to clone core after retry'));
    
    const configPath = path.join(testHomeDir, '.chorenzo', 'config.yaml');
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it('should handle running init twice without errors', async () => {
    // First init
    await performInit({});
    
    const coreDir = path.join(testHomeDir, '.chorenzo', 'recipes', 'core');
    fs.mkdirSync(coreDir, { recursive: true });
    
    // Second init - should skip existing library
    const mockProgress = jest.fn();
    await expect(performInit({}, mockProgress)).resolves.not.toThrow();
    
    expect(mockProgress).toHaveBeenCalledWith('Skipping core (already exists)');
    expect(mockProgress).not.toHaveBeenCalledWith(expect.stringContaining('Error'));
    expect(mockProgress).not.toHaveBeenCalledWith(expect.stringContaining('fatal'));
  });
});