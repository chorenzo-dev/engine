import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import { setupFixture } from '~/test-utils/fixture-loader';

const frameworksYamlPath = path.join(
  process.cwd(),
  'src/resources/frameworks.yaml'
);
const frameworksYamlContent = fs.readFileSync(frameworksYamlPath, 'utf8');

const mockReadFileSync = jest.fn<(path: string, encoding?: string) => string>();
const mockExistsSync = jest.fn<(path: string) => boolean>();
const mockAccess = jest.fn<(path: string) => Promise<void>>();

jest.unstable_mockModule('fs', () => ({
  readFileSync: mockReadFileSync,
  existsSync: mockExistsSync,
}));

jest.unstable_mockModule('fs/promises', () => ({
  default: {
    access: mockAccess,
  },
  access: mockAccess,
}));

describe('Analysis Validate Command Integration Tests', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('should validate analysis.json file structure using validation command', async () => {
    setupFixture('simple-express', { addGitRepo: true });

    const validAnalysis = {
      isMonorepo: false,
      hasWorkspacePackageManager: true,
      workspaceEcosystem: 'javascript',
      workspaceDependencies: ['express'],
      ciCd: 'github_actions',
      projects: [
        {
          path: '.',
          language: 'javascript',
          type: 'api_server',
          framework: 'express',
          dockerized: false,
          dependencies: ['express'],
          hasPackageManager: true,
          ecosystem: 'javascript',
        },
      ],
    };

    mockExistsSync.mockImplementation((filePath: string) => {
      return (
        filePath.includes('analysis.json') ||
        filePath.includes('frameworks.yaml')
      );
    });

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('analysis.json')) {
        return JSON.stringify(validAnalysis);
      }
      if (filePath.includes('frameworks.yaml')) {
        return frameworksYamlContent;
      }
      return '';
    });

    const { analysisValidate } = await import('./analysis.validate');
    const mockProgress = jest.fn();

    await expect(
      analysisValidate({ file: '.chorenzo/analysis.json' }, mockProgress)
    ).resolves.not.toThrow();

    expect(mockProgress).toHaveBeenCalledWith(
      'Checking if analysis file exists'
    );
    expect(mockProgress).toHaveBeenCalledWith('Reading analysis file');
    expect(mockProgress).toHaveBeenCalledWith('Validating file structure');
    expect(mockProgress).toHaveBeenCalledWith('✅ Analysis file is valid');
  });

  it('should validate monorepo analysis structure', async () => {
    setupFixture('monorepo', { addGitRepo: true });

    const monorepoAnalysis = {
      isMonorepo: true,
      hasWorkspacePackageManager: true,
      workspaceEcosystem: 'javascript',
      workspaceDependencies: ['lerna', 'typescript'],
      ciCd: 'github_actions',
      projects: [
        {
          path: './packages/frontend',
          language: 'typescript',
          type: 'web_app',
          framework: 'react',
          dockerized: false,
          dependencies: ['react', 'typescript'],
          hasPackageManager: true,
          ecosystem: 'javascript',
        },
        {
          path: './packages/backend',
          language: 'typescript',
          type: 'api_server',
          framework: 'express',
          dockerized: true,
          dependencies: ['express', 'typescript'],
          hasPackageManager: true,
          ecosystem: 'javascript',
        },
      ],
    };

    mockExistsSync.mockImplementation((filePath: string) => {
      return (
        filePath.includes('analysis.json') ||
        filePath.includes('frameworks.yaml')
      );
    });

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('analysis.json')) {
        return JSON.stringify(monorepoAnalysis);
      }
      if (filePath.includes('frameworks.yaml')) {
        return frameworksYamlContent;
      }
      return '';
    });

    const { analysisValidate } = await import('./analysis.validate');
    const mockProgress = jest.fn();

    await expect(
      analysisValidate({ file: '.chorenzo/analysis.json' }, mockProgress)
    ).resolves.not.toThrow();

    expect(mockProgress).toHaveBeenCalledWith('✅ Analysis file is valid');
  });

  it('should handle validation errors for invalid analysis structure', async () => {
    setupFixture('simple-express', { addGitRepo: true });

    const invalidAnalysis = {
      isMonorepo: 'not-a-boolean',
      hasWorkspacePackageManager: true,
      projects: [],
      ciCd: 'invalid_system',
    };

    mockExistsSync.mockImplementation((filePath: string) => {
      return (
        filePath.includes('analysis.json') ||
        filePath.includes('frameworks.yaml')
      );
    });

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('analysis.json')) {
        return JSON.stringify(invalidAnalysis);
      }
      if (filePath.includes('frameworks.yaml')) {
        return frameworksYamlContent;
      }
      return '';
    });

    const { analysisValidate } = await import('./analysis.validate');
    const mockProgress = jest.fn();

    await expect(
      analysisValidate({ file: '.chorenzo/analysis.json' }, mockProgress)
    ).rejects.toThrow();

    expect(mockProgress).toHaveBeenCalledWith('❌ Validation failed');
    expect(mockProgress).toHaveBeenCalledWith(expect.stringContaining('Found'));
    expect(mockProgress).toHaveBeenCalledWith(
      expect.stringContaining('validation error')
    );
  });

  it('should handle missing analysis file', async () => {
    setupFixture('simple-express', { addGitRepo: true });

    mockExistsSync.mockImplementation(() => false);
    mockAccess.mockRejectedValue(new Error('File not found'));

    const { analysisValidate } = await import('./analysis.validate');
    const mockProgress = jest.fn();

    await expect(
      analysisValidate({ file: '.chorenzo/analysis.json' }, mockProgress)
    ).rejects.toThrow('Analysis file not found');

    expect(mockProgress).toHaveBeenCalledWith('❌ Validation failed');
  });

  it('should handle invalid JSON in analysis file', async () => {
    setupFixture('simple-express', { addGitRepo: true });

    mockExistsSync.mockImplementation((filePath: string) => {
      return (
        filePath.includes('analysis.json') ||
        filePath.includes('frameworks.yaml')
      );
    });

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('analysis.json')) {
        return 'invalid json {';
      }
      if (filePath.includes('frameworks.yaml')) {
        return frameworksYamlContent;
      }
      return '';
    });

    const { analysisValidate } = await import('./analysis.validate');
    const mockProgress = jest.fn();

    await expect(
      analysisValidate({ file: '.chorenzo/analysis.json' }, mockProgress)
    ).rejects.toThrow();

    expect(mockProgress).toHaveBeenCalledWith('❌ Validation failed');
  });
});
