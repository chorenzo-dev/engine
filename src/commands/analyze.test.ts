import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import * as path from 'path';
import type { WorkspaceAnalysis } from '../types/analysis';
import { setupFixture } from '../test-utils/fixture-loader';

const mockQuery = jest.fn<() => AsyncGenerator<any, void, unknown>>();
const mockWriteJson = jest.fn<(path: string, data: any) => Promise<void>>();

jest.unstable_mockModule('@anthropic-ai/claude-code', () => ({
  query: mockQuery,
}));

jest.unstable_mockModule('../utils/json.utils', () => ({
  writeJson: mockWriteJson,
  readJson: jest.fn<() => Promise<any>>(),
}));

describe('Analyze Command Integration Tests', () => {
  let performAnalysis: (progress?: (message: string) => void) => Promise<{
    analysis: WorkspaceAnalysis | null;
    metadata?: any;
    unrecognizedFrameworks?: string[];
  }>;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.restoreAllMocks();

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

    const mockProgress = jest.fn();
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

    expect(mockWriteJson).toHaveBeenCalledWith(
      path.join(process.cwd(), '.chorenzo', 'analysis.json'),
      result.analysis
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

    const mockProgress = jest.fn();
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
    expect(mockWriteJson).not.toHaveBeenCalled();
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
    expect(mockWriteJson).toHaveBeenCalledWith(
      path.join(process.cwd(), '.chorenzo', 'analysis.json'),
      expect.any(Object)
    );
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

    const mockProgress = jest.fn();
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

    expect(mockWriteJson).toHaveBeenCalledWith(
      path.join(process.cwd(), '.chorenzo', 'analysis.json'),
      result.analysis
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

    const mockProgress = jest.fn();
    const result = await performAnalysis(mockProgress);

    expect(result.analysis).toBeNull();
    expect(result.metadata?.subtype).toBe('error');
    expect(result.metadata?.error).toContain('Invalid JSON response');
    expect(mockWriteJson).not.toHaveBeenCalled();
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

    const mockProgress = jest.fn();
    const result = await performAnalysis(mockProgress);

    expect(result.analysis).toBeNull();
    expect(result.metadata?.subtype).toBe('error');
    expect(result.metadata?.error).toContain('missing required fields');
    expect(mockWriteJson).not.toHaveBeenCalled();
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

    const mockProgress = jest.fn();
    const result = await performAnalysis(mockProgress);

    expect(result.analysis).toBeNull();
    expect(result.metadata?.subtype).toBe('error');
    expect(result.metadata?.error).toContain('No projects found in workspace');
    expect(mockWriteJson).not.toHaveBeenCalled();
  });
});
