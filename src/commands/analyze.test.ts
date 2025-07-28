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
import type { WorkspaceAnalysis } from '~/types/analysis';
import type { OperationMetadata } from '~/types/common';

const frameworksYamlPath = path.join(
  process.cwd(),
  'src/resources/frameworks.yaml'
);
const frameworksYamlContent = fs.readFileSync(frameworksYamlPath, 'utf8');

const mockQuery = jest.fn<() => AsyncGenerator<unknown, void, unknown>>();
const mockReadFileSync = jest.fn<(path: string, encoding?: string) => string>();
const mockWriteFileSync =
  jest.fn<(path: string, data: string, encoding: string) => void>();
const mockExistsSync = jest.fn<(path: string) => boolean>();
const mockStatSync = jest.fn<
  (path: string) => {
    isDirectory: () => boolean;
    isFile: () => boolean;
    size: number;
    mtime: Date;
  }
>();
const mockMkdirSync =
  jest.fn<(path: string, options?: { recursive?: boolean }) => void>();
const mockReaddirSync = jest.fn<(path: string) => string[]>();
const mockRmSync =
  jest.fn<
    (path: string, options?: { recursive?: boolean; force?: boolean }) => void
  >();
const mockUnlinkSync = jest.fn<(path: string) => void>();
const mockRenameSync = jest.fn<(oldPath: string, newPath: string) => void>();

const mockStat = jest.fn<
  (path: string) => Promise<{
    isDirectory: () => boolean;
    isFile: () => boolean;
    size: number;
    mtime: Date;
  }>
>();
const mockReaddir = jest.fn<(path: string) => Promise<string[]>>();
const mockAccess = jest.fn<(path: string) => Promise<void>>();

jest.unstable_mockModule('@anthropic-ai/claude-code', () => ({
  query: mockQuery,
}));

jest.unstable_mockModule('fs', () => ({
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  existsSync: mockExistsSync,
  statSync: mockStatSync,
  mkdirSync: mockMkdirSync,
  readdirSync: mockReaddirSync,
  rmSync: mockRmSync,
  unlinkSync: mockUnlinkSync,
  renameSync: mockRenameSync,
}));

jest.unstable_mockModule('fs/promises', () => ({
  default: {
    stat: mockStat,
    readdir: mockReaddir,
    access: mockAccess,
  },
  stat: mockStat,
  readdir: mockReaddir,
  access: mockAccess,
}));

jest.unstable_mockModule('@anthropic-ai/claude-code', () => ({
  query: mockQuery,
}));

describe('Analyze Command Integration Tests', () => {
  let performAnalysis: (
    progress?: (message: string | null) => void
  ) => Promise<{
    analysis: WorkspaceAnalysis | null;
    metadata?: Partial<OperationMetadata>;
    unrecognizedFrameworks?: string[];
  }>;
  let mockProgress: jest.MockedFunction<(message: string | null) => void>;

  const setupDefaultMocks = () => {
    mockExistsSync.mockImplementation((filePath: string) => {
      if (
        filePath.includes('.gitignore') ||
        filePath.includes('package.json') ||
        filePath.includes('.git') ||
        filePath.includes('src/') ||
        filePath.includes('test-fixtures/') ||
        filePath.includes('frameworks.yaml') ||
        filePath.includes('resources')
      ) {
        return true;
      }
      return false;
    });

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('.gitignore')) {
        return 'node_modules/\n.env\n*.log';
      }
      if (filePath.includes('package.json')) {
        return JSON.stringify({ name: 'test-app', version: '1.0.0' });
      }
      if (filePath.includes('frameworks.yaml')) {
        return frameworksYamlContent;
      }
      return 'mock file content';
    });

    mockStatSync.mockImplementation((filePath: string) => ({
      isDirectory: () => filePath.endsWith('/') || !filePath.includes('.'),
      isFile: () => filePath.includes('.'),
      size: 1024,
      mtime: new Date(),
    }));

    mockStat.mockImplementation(async (filePath: string) => ({
      isDirectory: () => filePath.endsWith('/') || !filePath.includes('.'),
      isFile: () => filePath.includes('.'),
      size: 1024,
      mtime: new Date(),
    }));

    mockReaddir.mockImplementation(async (dirPath: string) => {
      if (dirPath.includes('simple-express')) {
        return ['package.json', 'src', 'index.js'];
      }
      return ['file1.js', 'file2.js'];
    });

    mockAccess.mockImplementation(async () => {
      return Promise.resolve();
    });

    mockWriteFileSync.mockImplementation(() => {});

    mockMkdirSync.mockImplementation(() => {});
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.restoreAllMocks();

    mockProgress = jest.fn();
    setupDefaultMocks();

    mockQuery.mockImplementation(async function* () {
      yield { type: 'result', is_error: false };
    });

    const analyzeModule = await import('./analyze');
    performAnalysis = analyzeModule.performAnalysis;
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('should analyze express workspace using fixture', async () => {
    setupFixture('simple-express', { addGitRepo: true });

    const expectedAnalysis: WorkspaceAnalysis = {
      isMonorepo: false,
      hasWorkspacePackageManager: false,
      workspaceEcosystem: 'javascript',
      projects: [
        {
          path: '.',
          language: 'javascript',
          type: 'api_server',
          framework: 'express',
          dependencies: ['express', 'dotenv'],
          hasPackageManager: true,
          ecosystem: 'javascript',
          dockerized: false,
        },
      ],
    };

    mockQuery.mockImplementation(async function* () {
      yield {
        type: 'result',
        subtype: 'success',
        result: JSON.stringify({
          is_monorepo: false,
          has_workspace_package_manager: false,
          workspace_ecosystem: 'javascript',
          projects: [
            {
              path: '.',
              language: 'javascript',
              type: 'api_server',
              framework: 'express',
              dependencies: ['express', 'dotenv'],
              has_package_manager: true,
              ecosystem: 'javascript',
              dockerized: false,
            },
          ],
        }),
        total_cost_usd: 0.05,
        num_turns: 3,
      };
    });

    const result = await performAnalysis(mockProgress);

    expect(result.analysis).toEqual(expectedAnalysis);
    expect(result.metadata).toEqual({
      type: 'result',
      subtype: 'success',
      costUsd: 0.05,
      turns: 3,
      durationSeconds: expect.any(Number),
    });
    expect(result.unrecognizedFrameworks).toBeUndefined();

    expect(mockProgress).toHaveBeenCalledWith('Finding git repository...');
    expect(mockProgress).toHaveBeenCalledWith('Building file tree...');
    expect(mockProgress).toHaveBeenCalledWith('Loading analysis prompt...');
    expect(mockProgress).toHaveBeenCalledWith(
      'Analyzing workspace with Claude...'
    );
    expect(mockProgress).toHaveBeenCalledWith('Validating frameworks...');

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      path.join(process.cwd(), '.chorenzo', 'analysis.json'),
      JSON.stringify(result.analysis, null, 2),
      'utf8'
    );
  });

  it('should handle unrecognized frameworks', async () => {
    setupFixture('simple-express', { addGitRepo: true });

    mockQuery.mockImplementation(async function* () {
      yield {
        type: 'result',
        subtype: 'success',
        result: JSON.stringify({
          is_monorepo: false,
          has_workspace_package_manager: false,
          workspace_ecosystem: 'javascript',
          projects: [
            {
              path: '.',
              language: 'javascript',
              type: 'web_app',
              framework: 'unknown-framework',
              dependencies: ['unknown-framework'],
              has_package_manager: true,
              ecosystem: 'javascript',
              dockerized: false,
            },
          ],
        }),
        total_cost_usd: 0.05,
        num_turns: 3,
      };
    });

    const result = await performAnalysis(mockProgress);

    expect(result.unrecognizedFrameworks).toEqual(['unknown-framework']);
    expect(mockProgress).toHaveBeenCalledWith(
      'Warning: 1 frameworks not recognized: unknown-framework'
    );
  });

  it('should handle Claude API failures', async () => {
    setupFixture('simple-express', { addGitRepo: true });
    mockQuery.mockImplementation(async function* () {
      yield {
        type: 'result',
        subtype: 'error',
        error: 'API Error',
      };
    });

    const result = await performAnalysis();

    expect(result.analysis).toBeNull();
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.subtype).toBe('error');
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('should handle git repository not found', async () => {
    setupFixture('simple-express');

    mockQuery.mockImplementation(async function* () {
      yield {
        type: 'result',
        subtype: 'success',
        result: JSON.stringify({
          is_monorepo: false,
          has_workspace_package_manager: false,
          workspace_ecosystem: 'javascript',
          projects: [
            {
              path: '.',
              language: 'javascript',
              type: 'library',
              dependencies: [],
              has_package_manager: false,
            },
          ],
        }),
        total_cost_usd: 0.03,
        num_turns: 2,
      };
    });

    const result = await performAnalysis();

    expect(result.analysis).toBeDefined();
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      path.join(process.cwd(), '.chorenzo', 'analysis.json'),
      expect.stringMatching(/^\{[\s\S]*\}$/),
      'utf8'
    );
  });

  it('should verify tool-specific progress events and thinking state', async () => {
    setupFixture('simple-express', { addGitRepo: true });

    mockQuery.mockImplementation(async function* () {
      yield {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              input: { file_path: 'package.json' },
            },
          ],
        },
      };
      yield {
        type: 'user',
        message: { content: 'thinking...' },
      };
      yield {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'LS',
              input: { path: '/workspace' },
            },
          ],
        },
      };
      yield {
        type: 'result',
        subtype: 'success',
        result: JSON.stringify({
          is_monorepo: false,
          has_workspace_package_manager: false,
          workspace_ecosystem: 'javascript',
          projects: [
            {
              path: '.',
              language: 'javascript',
              type: 'api_server',
              framework: 'express',
              dependencies: ['express', 'dotenv'],
              has_package_manager: true,
              ecosystem: 'javascript',
              dockerized: false,
            },
          ],
        }),
        total_cost_usd: 0.05,
        num_turns: 3,
      };
    });

    const mockProgress = jest.fn();
    const result = await performAnalysis(mockProgress);

    expect(result.analysis).toBeDefined();
    expect(result.metadata?.subtype).toBe('success');

    expect(mockProgress).toHaveBeenCalledWith('Finding git repository...');
    expect(mockProgress).toHaveBeenCalledWith('Building file tree...');
    expect(mockProgress).toHaveBeenCalledWith('Loading analysis prompt...');
    expect(mockProgress).toHaveBeenCalledWith(
      'Analyzing workspace with Claude...'
    );
    expect(mockProgress).toHaveBeenCalledWith('Reading package.json', false);
    expect(mockProgress).toHaveBeenCalledWith(null, true);
    expect(mockProgress).toHaveBeenCalledWith(null, false);
    expect(mockProgress).toHaveBeenCalledWith('Listing /workspace', false);
    expect(mockProgress).toHaveBeenCalledWith('Validating frameworks...');
  });

  it('should analyze monorepo with mixed languages', async () => {
    setupFixture('monorepo', { addGitRepo: true });

    const expectedAnalysis: WorkspaceAnalysis = {
      isMonorepo: true,
      hasWorkspacePackageManager: true,
      workspaceEcosystem: 'javascript',
      ciCd: 'github_actions',
      projects: [
        {
          path: 'apps/web-app',
          language: 'typescript',
          type: 'web_app',
          framework: 'nextjs',
          dependencies: ['next', 'react', 'react-dom', '@monorepo/shared-lib'],
          hasPackageManager: true,
          ecosystem: 'javascript',
          dockerized: false,
        },
        {
          path: 'apps/api-service',
          language: 'python',
          type: 'api_server',
          framework: 'fastapi',
          dependencies: ['fastapi', 'uvicorn', 'pydantic'],
          hasPackageManager: true,
          ecosystem: 'python',
          dockerized: false,
        },
        {
          path: 'apps/shared-lib',
          language: 'typescript',
          type: 'library',
          dependencies: ['react'],
          hasPackageManager: true,
          ecosystem: 'javascript',
          dockerized: false,
        },
      ],
    };

    mockQuery.mockImplementation(async function* () {
      yield {
        type: 'result',
        subtype: 'success',
        result: JSON.stringify({
          is_monorepo: true,
          has_workspace_package_manager: true,
          workspace_ecosystem: 'javascript',
          ci_cd: 'github_actions',
          projects: [
            {
              path: 'apps/web-app',
              language: 'typescript',
              type: 'web_app',
              framework: 'nextjs',
              dependencies: [
                'next',
                'react',
                'react-dom',
                '@monorepo/shared-lib',
              ],
              has_package_manager: true,
              ecosystem: 'javascript',
              dockerized: false,
            },
            {
              path: 'apps/api-service',
              language: 'python',
              type: 'api_server',
              framework: 'fastapi',
              dependencies: ['fastapi', 'uvicorn', 'pydantic'],
              has_package_manager: true,
              ecosystem: 'python',
              dockerized: false,
            },
            {
              path: 'apps/shared-lib',
              language: 'typescript',
              type: 'library',
              dependencies: ['react'],
              has_package_manager: true,
              ecosystem: 'javascript',
              dockerized: false,
            },
          ],
        }),
        total_cost_usd: 0.08,
        num_turns: 4,
      };
    });

    const result = await performAnalysis(mockProgress);

    expect(result.analysis).toEqual(expectedAnalysis);
    expect(result.metadata).toEqual({
      type: 'result',
      subtype: 'success',
      costUsd: 0.08,
      turns: 4,
      durationSeconds: expect.any(Number),
    });
    expect(result.unrecognizedFrameworks).toBeUndefined();

    expect(mockProgress).toHaveBeenCalledWith('Finding git repository...');
    expect(mockProgress).toHaveBeenCalledWith('Building file tree...');
    expect(mockProgress).toHaveBeenCalledWith('Loading analysis prompt...');
    expect(mockProgress).toHaveBeenCalledWith(
      'Analyzing workspace with Claude...'
    );
    expect(mockProgress).toHaveBeenCalledWith('Validating frameworks...');

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      path.join(process.cwd(), '.chorenzo', 'analysis.json'),
      JSON.stringify(result.analysis, null, 2),
      'utf8'
    );
  });
  it('should convert snake_case to camelCase in analysis results', async () => {
    setupFixture('simple-express', { addGitRepo: true });
    mockQuery.mockImplementation(async function* () {
      yield {
        type: 'result',
        subtype: 'success',
        result: JSON.stringify({
          is_monorepo: false,
          has_workspace_package_manager: true,
          workspace_ecosystem: 'typescript',
          workspace_dependencies: ['typescript', 'next'],
          ci_cd: 'github_actions',
          projects: [
            {
              path: '.',
              language: 'typescript',
              type: 'web_app',
              framework: 'nextjs',
              dependencies: ['next', 'react'],
              has_package_manager: true,
              ecosystem: 'javascript',
              dockerized: true,
            },
          ],
        }),
        total_cost_usd: 0.06,
        num_turns: 4,
      };
    });

    const result = await performAnalysis();

    expect(result.analysis).toEqual({
      isMonorepo: false,
      hasWorkspacePackageManager: true,
      workspaceEcosystem: 'typescript',
      workspaceDependencies: ['typescript', 'next'],
      ciCd: 'github_actions',
      projects: [
        {
          path: '.',
          language: 'typescript',
          type: 'web_app',
          framework: 'nextjs',
          dependencies: ['next', 'react'],
          hasPackageManager: true,
          ecosystem: 'javascript',
          dockerized: true,
        },
      ],
    });
  });

  it('should handle invalid JSON response from Claude', async () => {
    setupFixture('simple-express', { addGitRepo: true });

    mockQuery.mockImplementation(async function* () {
      yield {
        type: 'result',
        subtype: 'success',
        result: 'not valid json at all',
        total_cost_usd: 0.05,
        num_turns: 3,
      };
    });

    const result = await performAnalysis(mockProgress);

    expect(result.analysis).toBeNull();
    expect(result.metadata?.subtype).toBe('error');
    expect(result.metadata?.error).toContain('Invalid JSON response');
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('should filter out TodoWrite and TodoRead progress events', async () => {
    setupFixture('simple-express', { addGitRepo: true });

    mockQuery.mockImplementation(async function* () {
      yield {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'TodoWrite',
              input: { todos: [{ content: 'test task', status: 'pending' }] },
            },
          ],
        },
      };
      yield {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              input: { file_path: 'src/app.js' },
            },
          ],
        },
      };
      yield {
        type: 'result',
        subtype: 'success',
        result: JSON.stringify({
          is_monorepo: false,
          has_workspace_package_manager: false,
          workspace_ecosystem: 'javascript',
          projects: [
            {
              path: '.',
              language: 'javascript',
              type: 'api_server',
              framework: 'express',
              dependencies: ['express'],
              has_package_manager: true,
              ecosystem: 'javascript',
              dockerized: false,
            },
          ],
        }),
        total_cost_usd: 0.03,
        num_turns: 2,
      };
    });

    const mockProgress = jest.fn();
    const result = await performAnalysis(mockProgress);

    expect(result.analysis).toBeDefined();
    expect(result.metadata?.subtype).toBe('success');

    expect(mockProgress).not.toHaveBeenCalledWith(
      expect.stringContaining('TodoWrite')
    );
    expect(mockProgress).not.toHaveBeenCalledWith(
      expect.stringContaining('TodoRead')
    );
    expect(mockProgress).toHaveBeenCalledWith('Reading src/app.js', false);
  });

  it('should handle partial response missing required fields', async () => {
    setupFixture('simple-express', { addGitRepo: true });

    mockQuery.mockImplementation(async function* () {
      yield {
        type: 'result',
        subtype: 'success',
        result: JSON.stringify({
          projects: [
            {
              path: '.',
              language: 'javascript',
            },
          ],
        }),
        total_cost_usd: 0.05,
        num_turns: 3,
      };
    });

    const result = await performAnalysis(mockProgress);

    expect(result.analysis).toBeNull();
    expect(result.metadata?.subtype).toBe('error');
    expect(result.metadata?.error).toContain('missing required fields');
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('should handle empty workspace with no code files', async () => {
    setupFixture('simple-express', { addGitRepo: true });

    mockQuery.mockImplementation(async function* () {
      yield {
        type: 'result',
        subtype: 'success',
        result: JSON.stringify({
          is_monorepo: false,
          has_workspace_package_manager: false,
          projects: [],
        }),
        total_cost_usd: 0.03,
        num_turns: 2,
      };
    });

    const result = await performAnalysis(mockProgress);

    expect(result.analysis).toBeNull();
    expect(result.metadata?.subtype).toBe('error');
    expect(result.metadata?.error).toContain('No projects found in workspace');
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('should verify chorenzo directory operations show initialization progress', async () => {
    setupFixture('simple-express', { addGitRepo: true });

    mockQuery.mockImplementation(async function* () {
      yield {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Bash',
              input: { command: 'mkdir -p .chorenzo' },
            },
          ],
        },
      };
      yield {
        type: 'result',
        subtype: 'success',
        result: JSON.stringify({
          is_monorepo: false,
          has_workspace_package_manager: false,
          workspace_ecosystem: 'javascript',
          projects: [
            {
              path: '.',
              language: 'javascript',
              type: 'api_server',
              framework: 'express',
              dependencies: ['express'],
              has_package_manager: true,
              ecosystem: 'javascript',
              dockerized: false,
            },
          ],
        }),
        total_cost_usd: 0.03,
        num_turns: 2,
      };
    });

    const mockProgress = jest.fn();
    const result = await performAnalysis(mockProgress);

    expect(result.analysis).toBeDefined();
    expect(result.metadata?.subtype).toBe('success');

    expect(mockProgress).toHaveBeenCalledWith(
      'Initializing the chorenzo engine',
      false
    );
  });
});
