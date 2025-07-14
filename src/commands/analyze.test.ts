import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { WorkspaceAnalysis } from '../types/analysis';
import { setupFixture, type TestFixture } from '../test-utils/fixture-loader';

const mockQuery = jest.fn<() => AsyncGenerator<any, void, unknown>>();
const mockWriteJson = jest.fn<(path: string, data: any) => Promise<void>>();

jest.unstable_mockModule('@anthropic-ai/claude-code', () => ({
  query: mockQuery
}));

jest.unstable_mockModule('../utils/json.utils', () => ({
  writeJson: mockWriteJson,
  readJson: jest.fn<() => Promise<any>>()
}));

describe('Analyze Command Integration Tests', () => {
  let testDir: string;
  let originalCwd: string;
  let performAnalysis: (progress?: (message: string) => void) => Promise<{ analysis: WorkspaceAnalysis | null; metadata?: any; unrecognizedFrameworks?: string[] }>;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    
    originalCwd = process.cwd();
    testDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'analyze-test-'));
    process.chdir(testDir);
    
    const analyzeModule = await import('./analyze');
    performAnalysis = analyzeModule.performAnalysis;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('should analyze express workspace using fixture', async () => {
    const expressFixture = setupFixture('simple-express', testDir, { addGitRepo: true });

    const mockAnalysis: WorkspaceAnalysis = {
      isMonorepo: false,
      hasWorkspacePackageManager: false,
      workspaceEcosystem: 'javascript',
      projects: [{
        path: '.',
        language: 'javascript',
        type: 'api_server',
        framework: 'express',
        dependencies: ['express', 'dotenv'],
        hasPackageManager: true,
        ecosystem: 'npm',
        dockerized: false,
        ciCd: 'none'
      }]
    };

    mockQuery.mockImplementation(async function* () {
      yield {
        type: 'result',
        subtype: 'success',
        result: JSON.stringify({
          is_monorepo: false,
          has_workspace_package_manager: false,
          workspace_ecosystem: 'javascript',
          projects: [{
            path: '.',
            language: 'javascript',
            type: 'api_server',
            framework: 'express',
            dependencies: ['express', 'dotenv'],
            has_package_manager: true,
            ecosystem: 'npm',
            dockerized: false,
            ci_cd: 'none'
          }]
        }),
        total_cost_usd: 0.05,
        num_turns: 3
      };
    });


    const mockProgress = jest.fn();
    const result = await performAnalysis(mockProgress);

    expect(result.analysis).toEqual(mockAnalysis);
    expect(result.metadata).toEqual({
      type: 'result',
      subtype: 'success',
      costUsd: 0.05,
      turns: 3,
      durationSeconds: expect.any(Number)
    });
    expect(result.unrecognizedFrameworks).toBeUndefined();

    expect(mockProgress).toHaveBeenCalledWith('Finding git repository...');
    expect(mockProgress).toHaveBeenCalledWith('Building file tree...');
    expect(mockProgress).toHaveBeenCalledWith('Loading analysis prompt...');
    expect(mockProgress).toHaveBeenCalledWith('Analyzing workspace with Claude...');
    expect(mockProgress).toHaveBeenCalledWith('Validating frameworks...');

    expect(mockWriteJson).toHaveBeenCalledWith(
      path.join(testDir, '.chorenzo', 'analysis.json'),
      mockAnalysis
    );
  });

  it('should handle unrecognized frameworks', async () => {
    setupFixture('simple-express', testDir, { addGitRepo: true });
    const mockAnalysis: WorkspaceAnalysis = {
      isMonorepo: false,
      hasWorkspacePackageManager: false,
      workspaceEcosystem: 'javascript',
      projects: [{
        path: '.',
        language: 'javascript',
        type: 'web_app',
        framework: 'unknown-framework',
        dependencies: ['unknown-framework'],
        hasPackageManager: true,
        ecosystem: 'npm',
        dockerized: false,
        ciCd: 'none'
      }]
    };

    mockQuery.mockImplementation(async function* () {
      yield {
        type: 'result',
        subtype: 'success',
        result: JSON.stringify({
          is_monorepo: false,
          has_workspace_package_manager: false,
          workspace_ecosystem: 'javascript',
          projects: [{
            path: '.',
            language: 'javascript',
            type: 'web_app',
            framework: 'unknown-framework',
            dependencies: ['unknown-framework'],
            has_package_manager: true,
            ecosystem: 'npm',
            dockerized: false,
            ci_cd: 'none'
          }]
        }),
        total_cost_usd: 0.05,
        num_turns: 3
      };
    });


    const mockProgress = jest.fn();
    const result = await performAnalysis(mockProgress);

    expect(result.unrecognizedFrameworks).toEqual(['unknown-framework']);
    expect(mockProgress).toHaveBeenCalledWith('Warning: 1 frameworks not recognized: unknown-framework');
  });

  it('should handle Claude API failures', async () => {
    setupFixture('simple-express', testDir, { addGitRepo: true });
    mockQuery.mockImplementation(async function* () {
      yield {
        type: 'result',
        subtype: 'error',
        error: 'API Error'
      };
    });

    const result = await performAnalysis();

    expect(result.analysis).toBeNull();
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.subtype).toBe('error');
    expect(mockWriteJson).not.toHaveBeenCalled();
  });

  it('should handle git repository not found', async () => {
    setupFixture('simple-express', testDir, { addGitRepo: true });
    fs.rmSync(path.join(testDir, '.git'), { recursive: true, force: true });

    mockQuery.mockImplementation(async function* () {
      yield {
        type: 'result',
        subtype: 'success',
        result: JSON.stringify({
          is_monorepo: false,
          has_workspace_package_manager: false,
          workspace_ecosystem: 'javascript',
          projects: [{
            path: '.',
            language: 'javascript',
            type: 'library',
            dependencies: [],
            has_package_manager: false
          }]
        }),
        total_cost_usd: 0.03,
        num_turns: 2
      };
    });

    const result = await performAnalysis();

    expect(result.analysis).toBeDefined();
    expect(mockWriteJson).toHaveBeenCalledWith(
      path.join(testDir, '.chorenzo', 'analysis.json'),
      expect.any(Object)
    );
  });

  it.skip('should handle framework validation failures gracefully', async () => {
    const mockAnalysis: WorkspaceAnalysis = {
      isMonorepo: false,
      hasWorkspacePackageManager: false,
      workspaceEcosystem: 'javascript',
      projects: [{
        path: '.',
        language: 'javascript',
        type: 'web_app',
        framework: 'nextjs',
        dependencies: ['next', 'react', 'react-dom'],
        hasPackageManager: true,
        ecosystem: 'npm',
        dockerized: false,
        ciCd: 'none'
      }]
    };

    mockQuery.mockImplementation(async function* () {
      yield {
        type: 'result',
        subtype: 'success',
        result: JSON.stringify({
          is_monorepo: false,
          has_workspace_package_manager: false,
          workspace_ecosystem: 'javascript',
          projects: [{
            path: '.',
            language: 'javascript',
            type: 'web_app',
            framework: 'nextjs',
            dependencies: ['next', 'react', 'react-dom'],
            has_package_manager: true,
            ecosystem: 'npm',
            dockerized: false,
            ci_cd: 'none'
          }]
        }),
        total_cost_usd: 0.05,
        num_turns: 3
      };
    });


    const mockProgress = jest.fn();
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    const result = await performAnalysis(mockProgress);

    expect(result.analysis).toEqual(mockAnalysis);
    expect(mockProgress).toHaveBeenCalledWith('Warning: Framework validation failed');
    expect(consoleSpy).toHaveBeenCalledWith('Framework validation error:', expect.any(Error));
    
    consoleSpy.mockRestore();
  });

  it('should convert snake_case to camelCase in analysis results', async () => {
    setupFixture('simple-express', testDir, { addGitRepo: true });
    mockQuery.mockImplementation(async function* () {
      yield {
        type: 'result',
        subtype: 'success',
        result: JSON.stringify({
          is_monorepo: false,
          has_workspace_package_manager: true,
          workspace_ecosystem: 'typescript',
          workspace_dependencies: ['typescript', 'next'],
          projects: [{
            path: '.',
            language: 'typescript',
            type: 'web_app',
            framework: 'nextjs',
            dependencies: ['next', 'react'],
            has_package_manager: true,
            ecosystem: 'npm',
            dockerized: true,
            ci_cd: 'github_actions'
          }]
        }),
        total_cost_usd: 0.06,
        num_turns: 4
      };
    });


    const result = await performAnalysis();

    expect(result.analysis).toEqual({
      isMonorepo: false,
      hasWorkspacePackageManager: true,
      workspaceEcosystem: 'typescript',
      workspaceDependencies: ['typescript', 'next'],
      projects: [{
        path: '.',
        language: 'typescript',
        type: 'web_app',
        framework: 'nextjs',
        dependencies: ['next', 'react'],
        hasPackageManager: true,
        ecosystem: 'npm',
        dockerized: true,
        ciCd: 'github_actions'
      }]
    });
  });
});