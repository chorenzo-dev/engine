import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import * as fs from 'fs';
import { stringify as yamlStringify } from 'yaml';

import { Ecosystem, ProjectType } from '~/types/analysis';
import { RecipeDependency } from '~/types/recipe';

import {
  createLibraryConfig,
  createMockYamlData,
  mockExistsSync,
  mockPerformAnalysis,
  mockQuery,
  mockReadFileSync,
  mockReaddirSync,
  mockStatSync,
  mockWriteFileAtomicSync,
  setupDefaultMocks,
} from './recipes.test-utils';

describe('Recipe Application', () => {
  let performRecipesApply: typeof import('./recipes.apply').performRecipesApply;

  beforeEach(async () => {
    jest.clearAllMocks();
    setupDefaultMocks();

    const recipesModule = await import('./recipes.apply');
    performRecipesApply = recipesModule.performRecipesApply;
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  describe('Apply Command Integration', () => {
    const setupStandardFileSystemMocks = () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) {
          return true;
        }
        if (path.includes('state.json')) {
          return false;
        }
        if (path.includes('.chorenzo/recipes')) {
          return true;
        }
        if (path.includes('test-recipe')) {
          return true;
        }
        if (path.includes('metadata.yaml')) {
          return true;
        }
        if (path.includes('prompt.md')) {
          return true;
        }
        if (path.includes('apply_recipe.md')) {
          return true;
        }
        if (path.includes('fix.md')) {
          return true;
        }
        if (path.includes('variants')) {
          return true;
        }
        return true;
      });

      mockStatSync.mockImplementation(
        () =>
          ({
            isDirectory: () => true,
            isFile: () => false,
          }) as fs.Stats
      );

      mockReaddirSync.mockImplementation((dirPath) => {
        if (dirPath.includes('.chorenzo/recipes')) {
          return ['test-recipe'];
        }
        return [];
      });
    };

    const setupSuccessfulQueryMock = () => {
      mockQuery.mockImplementation(function* () {
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Execution completed successfully',
          total_cost_usd: 0.05,
        };
      });
    };

    const setupErrorQueryMock = () => {
      mockQuery.mockImplementation(function* () {
        yield {
          type: 'result',
          subtype: 'error',
        };
      });
    };

    const setupStandardApplyScenario = () => {
      setupStandardFileSystemMocks();
      setupSuccessfulQueryMock();

      const mockYamlData = createMockYamlData({
        provides: ['test_feature.exists'],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('analysis.json')) {
          return JSON.stringify({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
            workspaceEcosystem: Ecosystem.Javascript,
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: Ecosystem.Javascript,
                type: ProjectType.WebApp,
                dependencies: [],
                hasPackageManager: true,
              },
            ],
          });
        }
        if (filePath.includes('config.yaml')) {
          return yamlStringify(mockYamlData.config);
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        if (filePath.includes('fix.md')) {
          return 'Base fix instructions for all variants.';
        }
        return '';
      });
    };

    it('should apply recipe successfully', async () => {
      setupStandardApplyScenario();

      const result = await performRecipesApply({
        recipe: 'test-recipe',
      });

      expect(result).toBeDefined();
      expect(result.summary.successfulProjects).toBe(1);
      expect(result.executionResults[0]?.output).toBe(
        'Execution completed successfully'
      );
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should verify progress events and thinking state during recipe application', async () => {
      setupStandardFileSystemMocks();

      const mockYamlData = createMockYamlData({
        provides: ['test_feature.exists'],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('analysis.json')) {
          return JSON.stringify({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
            workspaceEcosystem: Ecosystem.Javascript,
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: Ecosystem.Javascript,
                type: ProjectType.WebApp,
                dependencies: [],
                hasPackageManager: true,
              },
            ],
          });
        }
        if (filePath.includes('config.yaml')) {
          return yamlStringify(mockYamlData.config);
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        if (filePath.includes('fix.md')) {
          return 'Base fix instructions for all variants.';
        }
        return '';
      });

      mockQuery.mockImplementation(function* () {
        yield {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'Read',
                input: { file_path: 'src/package.json' },
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
                name: 'Write',
                input: { file_path: '.eslintrc.js', content: 'eslint config' },
              },
            ],
          },
        };
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Execution completed successfully',
          total_cost_usd: 0.05,
        };
      });

      const mockProgress = jest.fn();
      const result = await performRecipesApply(
        {
          recipe: 'test-recipe',
        },
        mockProgress
      );

      expect(result).toBeDefined();
      expect(result.summary.successfulProjects).toBe(1);

      expect(mockProgress).toHaveBeenCalledWith('Loading recipe');
      expect(mockProgress).toHaveBeenCalledWith('Validating recipe structure');
      expect(mockProgress).toHaveBeenCalledWith('Ensuring analysis data');
      expect(mockProgress).toHaveBeenCalledWith('Checking recipe dependencies');
      expect(mockProgress).toHaveBeenCalledWith(
        'Filtering applicable projects'
      );
      expect(mockProgress).toHaveBeenCalledWith(
        'Reading src/package.json',
        false
      );
      expect(mockProgress).toHaveBeenCalledWith(null, true);
      expect(mockProgress).toHaveBeenCalledWith(null, false);
      expect(mockProgress).toHaveBeenCalledWith('Writing .eslintrc.js', false);
    });

    it('should handle missing analysis by running analysis', async () => {
      setupStandardFileSystemMocks();
      setupSuccessfulQueryMock();

      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) {
          return false;
        }
        if (path.includes('state.json')) {
          return false;
        }
        if (path.includes('.chorenzo/recipes')) {
          return true;
        }
        if (path.includes('test-recipe')) {
          return true;
        }
        if (path.includes('metadata.yaml')) {
          return true;
        }
        if (path.includes('prompt.md')) {
          return true;
        }
        if (path.includes('apply_recipe.md')) {
          return true;
        }
        if (path.includes('fix.md')) {
          return true;
        }
        if (path.includes('variants')) {
          return true;
        }
        return true;
      });

      const mockYamlData = createMockYamlData({
        provides: ['test_feature.exists'],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('config.yaml')) {
          return yamlStringify(mockYamlData.config);
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        if (filePath.includes('fix.md')) {
          return 'Basic fix prompt content';
        }
        if (filePath.includes('variants/basic.md')) {
          return 'Basic variant fix content';
        }
        if (filePath.includes('state.json')) {
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        }
        return '';
      });

      mockPerformAnalysis.mockResolvedValue({
        analysis: {
          isMonorepo: false,
          hasWorkspacePackageManager: false,
          workspaceEcosystem: Ecosystem.Javascript,
          projects: [
            {
              path: '.',
              language: 'javascript',
              ecosystem: Ecosystem.Javascript,
              type: ProjectType.WebApp,
              dependencies: [],
              hasPackageManager: true,
            },
          ],
        },
      });

      await performRecipesApply({
        recipe: 'test-recipe',
      });

      expect(mockPerformAnalysis).toHaveBeenCalled();
    });

    it('should validate recipe dependencies', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) {
          return true;
        }
        if (path.includes('state.json')) {
          return true;
        }
        if (path.includes('.chorenzo/recipes')) {
          return true;
        }
        if (path.includes('test-recipe')) {
          return true;
        }
        if (path.includes('metadata.yaml')) {
          return true;
        }
        if (path.includes('prompt.md')) {
          return true;
        }
        if (path.includes('apply_recipe.md')) {
          return true;
        }
        if (path.includes('fix.md')) {
          return true;
        }
        if (path.includes('variants')) {
          return true;
        }
        return true;
      });

      mockStatSync.mockImplementation(
        () =>
          ({
            isDirectory: () => true,
            isFile: () => false,
          }) as fs.Stats
      );

      mockReaddirSync.mockImplementation((dirPath) => {
        if (dirPath.includes('.chorenzo/recipes')) {
          return ['test-recipe'];
        }
        return [];
      });

      const mockYamlData = createMockYamlData({
        provides: ['test_feature.exists'],
        requires: [{ key: 'prerequisite.exists', equals: 'true' }],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('analysis.json')) {
          return JSON.stringify({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
            workspaceEcosystem: Ecosystem.Javascript,
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: Ecosystem.Javascript,
                type: ProjectType.WebApp,
                dependencies: [],
                hasPackageManager: true,
              },
            ],
          });
        }
        if (filePath.includes('config.yaml')) {
          return yamlStringify(mockYamlData.config);
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        if (filePath.includes('state.json')) {
          return JSON.stringify({
            workspace: {
              'prerequisite.exists': false,
            },
            projects: {},
          });
        }
        return '';
      });

      await expect(
        performRecipesApply({
          recipe: 'test-recipe',
        })
      ).rejects.toThrow('cannot be applied due to unmet requirements');
    });

    it('should handle execution failures gracefully', async () => {
      setupStandardFileSystemMocks();
      setupErrorQueryMock();

      const mockYamlData = createMockYamlData({
        provides: ['test_feature.exists'],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('analysis.json')) {
          return JSON.stringify({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
            workspaceEcosystem: Ecosystem.Javascript,
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: Ecosystem.Javascript,
                type: ProjectType.WebApp,
                dependencies: [],
                hasPackageManager: true,
              },
            ],
          });
        }
        if (filePath.includes('config.yaml')) {
          return yamlStringify(mockYamlData.config);
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        if (filePath.includes('fix.md')) {
          return 'Basic fix prompt content';
        }
        if (filePath.includes('variants/basic.md')) {
          return 'Basic variant fix content';
        }
        if (filePath.includes('state.json')) {
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        }
        return '';
      });

      const result = await performRecipesApply({
        recipe: 'test-recipe',
      });

      expect(result.summary.failedProjects).toBe(1);
      expect(result.executionResults[0]?.success).toBe(false);
      expect(result.executionResults[0]).not.toHaveProperty('output');
    });

    it('should apply recipe with custom variant', async () => {
      setupStandardFileSystemMocks();
      setupSuccessfulQueryMock();

      const mockYamlData = createMockYamlData({
        variants: [
          { id: 'basic', fix_prompt: 'variants/basic.md' },
          { id: 'advanced', fix_prompt: 'variants/advanced.md' },
        ],
        provides: ['test_feature.exists'],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('analysis.json')) {
          return JSON.stringify({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
            workspaceEcosystem: Ecosystem.Javascript,
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: Ecosystem.Javascript,
                type: ProjectType.WebApp,
                dependencies: [],
                hasPackageManager: true,
              },
            ],
          });
        }
        if (filePath.includes('config.yaml')) {
          return yamlStringify(mockYamlData.config);
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('fix.md')) {
          return 'Basic fix prompt content';
        }
        if (filePath.includes('variants/basic.md')) {
          return 'Basic variant fix content';
        }
        if (filePath.includes('variants/advanced.md')) {
          return 'Advanced variant fix content';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        if (filePath.includes('fix.md')) {
          return 'Basic fix prompt content';
        }
        if (filePath.includes('variants/basic.md')) {
          return 'Basic variant fix content';
        }
        if (filePath.includes('state.json')) {
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        }
        return '';
      });

      const result = await performRecipesApply({
        recipe: 'test-recipe',
        variant: 'advanced',
      });

      expect(result).toBeDefined();
      expect(result.summary.successfulProjects).toBe(1);
    });

    it('should apply recipe with project filtering', async () => {
      setupStandardFileSystemMocks();

      const mockYamlData = createMockYamlData({
        provides: ['test_feature.exists'],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('analysis.json')) {
          return JSON.stringify({
            isMonorepo: true,
            hasWorkspacePackageManager: true,
            workspaceEcosystem: Ecosystem.Javascript,
            projects: [
              {
                path: 'frontend',
                language: 'javascript',
                ecosystem: Ecosystem.Javascript,
                type: ProjectType.WebApp,
                dependencies: [],
                hasPackageManager: true,
              },
              {
                path: 'backend',
                language: 'javascript',
                ecosystem: Ecosystem.Javascript,
                type: 'api_server',
                dependencies: [],
                hasPackageManager: true,
              },
            ],
          });
        }
        if (filePath.includes('config.yaml')) {
          return yamlStringify(mockYamlData.config);
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        if (filePath.includes('fix.md')) {
          return 'Basic fix prompt content';
        }
        if (filePath.includes('variants/basic.md')) {
          return 'Basic variant fix content';
        }
        if (filePath.includes('state.json')) {
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        }
        return '';
      });

      setupSuccessfulQueryMock();

      const result = await performRecipesApply({
        recipe: 'test-recipe',
        project: 'frontend',
      });

      expect(result).toBeDefined();
      expect(result.summary.totalProjects).toBe(1);
      expect(result.summary.successfulProjects).toBe(1);
    });

    it('should handle multiple projects with mixed success', async () => {
      setupStandardFileSystemMocks();

      const mockYamlData = createMockYamlData({
        provides: ['test_feature.exists'],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('analysis.json')) {
          return JSON.stringify({
            isMonorepo: true,
            hasWorkspacePackageManager: true,
            workspaceEcosystem: Ecosystem.Javascript,
            projects: [
              {
                path: 'project1',
                language: 'javascript',
                ecosystem: Ecosystem.Javascript,
                type: ProjectType.WebApp,
                dependencies: [],
                hasPackageManager: true,
              },
              {
                path: 'project2',
                language: 'javascript',
                ecosystem: Ecosystem.Javascript,
                type: 'api_server',
                dependencies: [],
                hasPackageManager: true,
              },
            ],
          });
        }
        if (filePath.includes('config.yaml')) {
          return yamlStringify(mockYamlData.config);
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        if (filePath.includes('fix.md')) {
          return 'Basic fix prompt content';
        }
        if (filePath.includes('variants/basic.md')) {
          return 'Basic variant fix content';
        }
        if (filePath.includes('state.json')) {
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        }
        return '';
      });

      let queryCallCount = 0;
      mockQuery.mockImplementation(function* () {
        queryCallCount++;
        if (queryCallCount === 1) {
          yield { type: 'result', is_error: false };
        } else if (queryCallCount === 2) {
          yield {
            type: 'result',
            subtype: 'success',
            result: 'execution successful',
          };
        } else {
          yield {
            type: 'result',
            subtype: 'error',
          };
        }
      });

      const result = await performRecipesApply({
        recipe: 'test-recipe',
      });

      expect(result.summary.totalProjects).toBe(2);
      expect(result.summary.successfulProjects).toBe(1);
      expect(result.summary.failedProjects).toBe(1);
    });

    it('should handle dependency conflicts', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) {
          return true;
        }
        if (path.includes('state.json')) {
          return true;
        }
        if (path.includes('.chorenzo/recipes')) {
          return true;
        }
        if (path.includes('test-recipe')) {
          return true;
        }
        if (path.includes('metadata.yaml')) {
          return true;
        }
        if (path.includes('prompt.md')) {
          return true;
        }
        if (path.includes('apply_recipe.md')) {
          return true;
        }
        if (path.includes('fix.md')) {
          return true;
        }
        if (path.includes('variants')) {
          return true;
        }
        return true;
      });

      mockStatSync.mockImplementation(
        () =>
          ({
            isDirectory: () => true,
            isFile: () => false,
          }) as fs.Stats
      );

      mockReaddirSync.mockImplementation((dirPath) => {
        if (dirPath.includes('.chorenzo/recipes')) {
          return ['test-recipe'];
        }
        return [];
      });

      const mockYamlData = createMockYamlData({
        provides: ['test_feature.exists'],
        requires: [{ key: 'prerequisite.version', equals: '2.0.0' }],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('analysis.json')) {
          return JSON.stringify({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
            workspaceEcosystem: Ecosystem.Javascript,
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: Ecosystem.Javascript,
                type: ProjectType.WebApp,
                dependencies: [],
                hasPackageManager: true,
              },
            ],
          });
        }
        if (filePath.includes('config.yaml')) {
          return yamlStringify(mockYamlData.config);
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        if (filePath.includes('state.json')) {
          return JSON.stringify({
            workspace: {
              'prerequisite.version': '1.0.0',
            },
            projects: {},
          });
        }
        return '';
      });

      await expect(
        performRecipesApply({
          recipe: 'test-recipe',
        })
      ).rejects.toThrow('cannot be applied due to unmet requirements');
    });

    it('should handle recipe not found', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('.chorenzo/recipes')) {
          return true;
        }
        if (path.includes('other-recipe')) {
          return true;
        }
        if (path.includes('other-recipe/metadata.yaml')) {
          return true;
        }
        return false;
      });

      mockStatSync.mockImplementation(
        (path) =>
          ({
            isDirectory: () => !path.includes('.'),
            isFile: () => path.includes('.'),
          }) as fs.Stats
      );

      mockReaddirSync.mockImplementation((dirPath) => {
        if (dirPath === '/test/home/.chorenzo/recipes') {
          return ['other-recipe'];
        }
        return [];
      });

      await expect(
        performRecipesApply({
          recipe: 'nonexistent-recipe',
        })
      ).rejects.toThrow("Recipe 'nonexistent-recipe' not found");
    });

    it('should handle no applicable projects', async () => {
      setupStandardFileSystemMocks();

      const mockYamlData = createMockYamlData({
        provides: ['test_feature.exists'],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('analysis.json')) {
          return JSON.stringify({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
            workspaceEcosystem: 'python',
            projects: [
              {
                path: '.',
                language: 'python',
                ecosystem: 'python',
                type: 'script',
                dependencies: [],
                hasPackageManager: true,
              },
            ],
          });
        }
        if (filePath.includes('config.yaml')) {
          return yamlStringify(mockYamlData.config);
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        if (filePath.includes('fix.md')) {
          return 'Basic fix prompt content';
        }
        if (filePath.includes('variants/basic.md')) {
          return 'Basic variant fix content';
        }
        if (filePath.includes('state.json')) {
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        }
        return '';
      });

      await expect(
        performRecipesApply({
          recipe: 'test-recipe',
        })
      ).rejects.toThrow('No applicable projects found');
    });

    it('should handle corrupted analysis file', async () => {
      setupStandardFileSystemMocks();

      const mockYamlData = createMockYamlData({
        provides: ['test_feature.exists'],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('analysis.json')) {
          throw new Error('Invalid JSON syntax');
        }
        if (filePath.includes('config.yaml')) {
          return yamlStringify(mockYamlData.config);
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        if (filePath.includes('fix.md')) {
          return 'Basic fix prompt content';
        }
        if (filePath.includes('variants/basic.md')) {
          return 'Basic variant fix content';
        }
        if (filePath.includes('state.json')) {
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        }
        return '';
      });

      mockPerformAnalysis.mockResolvedValue({
        analysis: {
          isMonorepo: false,
          hasWorkspacePackageManager: false,
          workspaceEcosystem: Ecosystem.Javascript,
          projects: [
            {
              path: '.',
              language: 'javascript',
              ecosystem: Ecosystem.Javascript,
              type: ProjectType.WebApp,
              dependencies: [],
              hasPackageManager: true,
            },
          ],
        },
      });

      setupSuccessfulQueryMock();

      const result = await performRecipesApply({
        recipe: 'test-recipe',
      });

      expect(mockPerformAnalysis).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should handle analysis generation failure', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) {
          return false;
        }
        if (path.includes('state.json')) {
          return false;
        }
        if (path.includes('.chorenzo/recipes')) {
          return true;
        }
        if (path.includes('test-recipe')) {
          return true;
        }
        if (path.includes('metadata.yaml')) {
          return true;
        }
        if (path.includes('prompt.md')) {
          return true;
        }
        if (path.includes('apply_recipe.md')) {
          return true;
        }
        if (path.includes('fix.md')) {
          return true;
        }
        if (path.includes('variants')) {
          return true;
        }
        return true;
      });

      mockStatSync.mockImplementation(
        () =>
          ({
            isDirectory: () => true,
            isFile: () => false,
          }) as fs.Stats
      );

      mockReaddirSync.mockImplementation((dirPath) => {
        if (dirPath.includes('.chorenzo/recipes')) {
          return ['test-recipe'];
        }
        return [];
      });

      const mockYamlData = createMockYamlData({
        provides: ['test_feature.exists'],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('config.yaml')) {
          return yamlStringify(mockYamlData.config);
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        if (filePath.includes('fix.md')) {
          return 'Basic fix prompt content';
        }
        if (filePath.includes('variants/basic.md')) {
          return 'Basic variant fix content';
        }
        if (filePath.includes('state.json')) {
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        }
        return '';
      });

      mockPerformAnalysis.mockResolvedValue({
        analysis: null,
        metadata: {
          error: 'Analysis failed',
          type: 'result',
          subtype: 'error',
          costUsd: 0,
          turns: 0,
          durationSeconds: 0,
        },
      });

      await expect(
        performRecipesApply({
          recipe: 'test-recipe',
        })
      ).rejects.toThrow('Analysis failed');
    });

    it('should handle recipe application failure', async () => {
      setupStandardFileSystemMocks();

      const mockYamlData = createMockYamlData({
        provides: ['test_feature.exists'],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('analysis.json')) {
          return JSON.stringify({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
            workspaceEcosystem: Ecosystem.Javascript,
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: Ecosystem.Javascript,
                type: ProjectType.WebApp,
                dependencies: [],
                hasPackageManager: true,
              },
            ],
          });
        }
        if (filePath.includes('config.yaml')) {
          return yamlStringify(mockYamlData.config);
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        if (filePath.includes('fix.md')) {
          return 'Basic fix prompt content';
        }
        if (filePath.includes('variants/basic.md')) {
          return 'Basic variant fix content';
        }
        if (filePath.includes('state.json')) {
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        }
        return '';
      });

      setupErrorQueryMock();

      const result = await performRecipesApply({
        recipe: 'test-recipe',
      });

      expect(result.summary.totalProjects).toBe(1);
      expect(result.summary.successfulProjects).toBe(0);
      expect(result.summary.failedProjects).toBe(1);
      expect(result.executionResults[0]?.success).toBe(false);
      expect(result.executionResults[0]?.error).toContain(
        'Claude execution failed with error'
      );
    });

    it('should handle variant not found', async () => {
      setupStandardFileSystemMocks();

      const mockYamlData = createMockYamlData({
        provides: ['test_feature.exists'],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('analysis.json')) {
          return JSON.stringify({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
            workspaceEcosystem: Ecosystem.Javascript,
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: Ecosystem.Javascript,
                type: ProjectType.WebApp,
                dependencies: [],
                hasPackageManager: true,
              },
            ],
          });
        }
        if (filePath.includes('config.yaml')) {
          return yamlStringify(mockYamlData.config);
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        if (filePath.includes('fix.md')) {
          return 'Basic fix prompt content';
        }
        if (filePath.includes('variants/basic.md')) {
          return 'Basic variant fix content';
        }
        if (filePath.includes('state.json')) {
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        }
        return '';
      });

      const result = await performRecipesApply({
        recipe: 'test-recipe',
        variant: 'nonexistent',
      });

      expect(result.summary.totalProjects).toBe(1);
      expect(result.summary.successfulProjects).toBe(0);
      expect(result.summary.failedProjects).toBe(1);
      expect(result.executionResults[0]?.success).toBe(false);
      expect(result.executionResults[0]?.error).toContain(
        'not found for ecosystem'
      );
    });

    it('should handle state file read errors gracefully', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) {
          return true;
        }
        if (path.includes('state.json')) {
          return true;
        }
        if (path.includes('.chorenzo/recipes')) {
          return true;
        }
        if (path.includes('test-recipe')) {
          return true;
        }
        if (path.includes('metadata.yaml')) {
          return true;
        }
        if (path.includes('prompt.md')) {
          return true;
        }
        if (path.includes('apply_recipe.md')) {
          return true;
        }
        if (path.includes('fix.md')) {
          return true;
        }
        if (path.includes('variants')) {
          return true;
        }
        return true;
      });

      mockStatSync.mockImplementation(
        () =>
          ({
            isDirectory: () => true,
            isFile: () => false,
          }) as fs.Stats
      );

      mockReaddirSync.mockImplementation((dirPath) => {
        if (dirPath.includes('.chorenzo/recipes')) {
          return ['test-recipe'];
        }
        return [];
      });

      const mockYamlData = createMockYamlData({
        provides: ['test_feature.exists'],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('analysis.json')) {
          return JSON.stringify({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
            workspaceEcosystem: Ecosystem.Javascript,
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: Ecosystem.Javascript,
                type: ProjectType.WebApp,
                dependencies: [],
                hasPackageManager: true,
              },
            ],
          });
        }
        if (filePath.includes('config.yaml')) {
          return yamlStringify(mockYamlData.config);
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        if (filePath.includes('state.json')) {
          throw new Error('Permission denied');
        }
        return '';
      });

      setupSuccessfulQueryMock();

      await expect(
        performRecipesApply({
          recipe: 'test-recipe',
        })
      ).rejects.toThrow(/Failed to read state file: Permission denied/);
    });

    it('should handle empty recipe application result', async () => {
      setupStandardFileSystemMocks();

      const mockYamlData = createMockYamlData({
        provides: ['test_feature.exists'],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('analysis.json')) {
          return JSON.stringify({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
            workspaceEcosystem: Ecosystem.Javascript,
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: Ecosystem.Javascript,
                type: ProjectType.WebApp,
                dependencies: [],
                hasPackageManager: true,
              },
            ],
          });
        }
        if (filePath.includes('config.yaml')) {
          return yamlStringify(mockYamlData.config);
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        if (filePath.includes('fix.md')) {
          return 'Basic fix prompt content';
        }
        if (filePath.includes('variants/basic.md')) {
          return 'Basic variant fix content';
        }
        if (filePath.includes('state.json')) {
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        }
        return '';
      });

      mockQuery.mockImplementation(function* () {
        yield {
          type: 'result',
          subtype: 'success',
          result: '',
        };
      });

      const result = await performRecipesApply({
        recipe: 'test-recipe',
      });

      expect(result.summary.totalProjects).toBe(1);
      expect(result.summary.successfulProjects).toBe(1);
      expect(result.summary.failedProjects).toBe(0);
      expect(result.executionResults[0]?.success).toBe(true);
    });

    it('should verify chorenzo context initialization progress', async () => {
      setupStandardFileSystemMocks();

      const mockYamlData = createMockYamlData({
        provides: ['test_feature.exists'],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('analysis.json')) {
          return JSON.stringify({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
            workspaceEcosystem: Ecosystem.Javascript,
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: Ecosystem.Javascript,
                type: ProjectType.WebApp,
                dependencies: [],
                hasPackageManager: true,
              },
            ],
          });
        }
        if (filePath.includes('config.yaml')) {
          return yamlStringify(mockYamlData.config);
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        if (filePath.includes('fix.md')) {
          return 'Basic fix prompt content';
        }
        if (filePath.includes('variants/basic.md')) {
          return 'Basic variant fix content';
        }
        if (filePath.includes('state.json')) {
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        }
        return '';
      });

      mockQuery.mockImplementation(function* () {
        yield {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'Bash',
                input: { command: 'mkdir -p .chorenzo/recipes' },
              },
            ],
          },
        };
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Execution completed successfully',
          total_cost_usd: 0.05,
        };
      });

      const mockProgress = jest.fn();
      const result = await performRecipesApply(
        {
          recipe: 'test-recipe',
        },
        mockProgress
      );

      expect(result).toBeDefined();
      expect(result.summary.successfulProjects).toBe(1);

      expect(mockProgress).toHaveBeenCalledWith('Loading recipe');
      expect(mockProgress).toHaveBeenCalledWith('Validating recipe structure');
      expect(mockProgress).toHaveBeenCalledWith('Ensuring analysis data');
      expect(mockProgress).toHaveBeenCalledWith('Checking recipe dependencies');
      expect(mockProgress).toHaveBeenCalledWith(
        'Filtering applicable projects'
      );
      expect(mockProgress).toHaveBeenCalledWith(
        'Initializing the chorenzo engine',
        false
      );
    });

    it('should configure disallowedTools to block dangerous commands', async () => {
      setupStandardApplyScenario();

      const result = await performRecipesApply({
        recipe: 'test-recipe',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            disallowedTools: expect.arrayContaining([
              'Bash(git commit:*)',
              'Bash(git push:*)',
              'Bash(sudo:*)',
              'Bash(rm:*)',
              'Bash(chmod:*)',
            ]),
          }),
        })
      );
      expect(result.summary.successfulProjects).toBe(1);
    });

    it('should allow safe commands during recipe execution', async () => {
      setupStandardApplyScenario();

      mockQuery.mockImplementation(function* () {
        yield {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'Bash',
                input: { command: 'npm install' },
              },
            ],
          },
        };
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Execution completed successfully',
          total_cost_usd: 0.05,
        };
      });

      const result = await performRecipesApply({
        recipe: 'test-recipe',
      });

      expect(result).toBeDefined();
      expect(result.summary.successfulProjects).toBe(1);
    });

    it('should apply workspace-level recipe successfully', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) {
          return true;
        }
        if (path.includes('state.json')) {
          return false;
        }
        if (path.includes('.chorenzo/recipes')) {
          return true;
        }
        if (path.includes('workspace-recipe')) {
          return true;
        }
        if (path.includes('metadata.yaml')) {
          return true;
        }
        if (path.includes('prompt.md')) {
          return true;
        }
        if (path.includes('apply_recipe.md')) {
          return true;
        }
        if (path.includes('fix.md')) {
          return true;
        }
        if (path.includes('variants')) {
          return true;
        }
        return true;
      });

      mockStatSync.mockImplementation(
        () =>
          ({
            isDirectory: () => true,
            isFile: () => false,
          }) as fs.Stats
      );

      mockReaddirSync.mockImplementation((dirPath) => {
        if (dirPath.includes('.chorenzo/recipes')) {
          return ['workspace-recipe'];
        }
        return [];
      });

      const mockYamlData = createMockYamlData({
        recipeId: 'workspace-recipe',
        level: 'workspace-only',
        provides: ['workspace_feature.exists'],
      });
      (mockYamlData.config.libraries as Record<string, unknown>)[
        'workspace-recipe'
      ] = createLibraryConfig('workspace-recipe');

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('analysis.json')) {
          return JSON.stringify({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
            workspaceEcosystem: Ecosystem.Javascript,
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: Ecosystem.Javascript,
                type: ProjectType.WebApp,
                dependencies: [],
                hasPackageManager: true,
              },
            ],
          });
        }
        if (filePath.includes('config.yaml')) {
          return yamlStringify(mockYamlData.config);
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        if (filePath.includes('fix.md')) {
          return 'Base fix instructions for all variants.';
        }
        return '';
      });

      setupSuccessfulQueryMock();

      const result = await performRecipesApply({
        recipe: 'workspace-recipe',
      });

      expect(result).toBeDefined();
      expect(result.summary.successfulProjects).toBe(1);
      expect(result.summary.totalProjects).toBe(1);
      expect(result.executionResults[0]?.projectPath).toBe('workspace');
    });

    it('should handle workspace recipe with unsupported ecosystem', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) {
          return true;
        }
        if (path.includes('state.json')) {
          return false;
        }
        if (path.includes('.chorenzo/recipes')) {
          return true;
        }
        if (path.includes('workspace-recipe')) {
          return true;
        }
        if (path.includes('metadata.yaml')) {
          return true;
        }
        if (path.includes('prompt.md')) {
          return true;
        }
        if (path.includes('apply_recipe.md')) {
          return true;
        }
        if (path.includes('fix.md')) {
          return true;
        }
        if (path.includes('variants')) {
          return true;
        }
        return true;
      });

      mockStatSync.mockImplementation(
        () =>
          ({
            isDirectory: () => true,
            isFile: () => false,
          }) as fs.Stats
      );

      mockReaddirSync.mockImplementation((dirPath) => {
        if (dirPath.includes('.chorenzo/recipes')) {
          return ['workspace-recipe'];
        }
        return [];
      });

      const mockYamlData = createMockYamlData({
        recipeId: 'workspace-recipe',
        level: 'workspace-only',
        provides: ['workspace_feature.exists'],
      });
      (mockYamlData.config.libraries as Record<string, unknown>)[
        'workspace-recipe'
      ] = createLibraryConfig('workspace-recipe');

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('analysis.json')) {
          return JSON.stringify({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
            workspaceEcosystem: 'python',
            projects: [
              {
                path: '.',
                language: 'python',
                ecosystem: 'python',
                type: 'script',
                dependencies: [],
                hasPackageManager: true,
              },
            ],
          });
        }
        if (filePath.includes('config.yaml')) {
          return yamlStringify(mockYamlData.config);
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        if (filePath.includes('fix.md')) {
          return 'Base fix instructions for all variants.';
        }
        return '';
      });

      await expect(
        performRecipesApply({
          recipe: 'workspace-recipe',
        })
      ).rejects.toThrow('does not support workspace ecosystem');
    });

    it('should apply ecosystem-agnostic workspace recipe to any ecosystem', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) {
          return true;
        }
        if (path.includes('state.json')) {
          return false;
        }
        if (path.includes('.chorenzo/recipes')) {
          return true;
        }
        if (path.includes('agnostic-workspace-recipe')) {
          return true;
        }
        if (path.includes('metadata.yaml')) {
          return true;
        }
        if (path.includes('prompt.md')) {
          return true;
        }
        if (path.includes('fix.md')) {
          return true;
        }
        return true;
      });

      mockStatSync.mockImplementation(
        () =>
          ({
            isDirectory: () => true,
            isFile: () => false,
          }) as fs.Stats
      );

      mockReaddirSync.mockImplementation((dirPath) => {
        if (dirPath.includes('.chorenzo/recipes')) {
          return ['agnostic-workspace-recipe'];
        }
        return [];
      });

      const mockYamlData = {
        config: {
          libraries: {
            'agnostic-workspace-recipe': createLibraryConfig(
              'agnostic-workspace-recipe'
            ),
          },
        },
        metadata: {
          id: 'agnostic-workspace-recipe',
          category: 'test',
          summary: 'Test ecosystem-agnostic workspace recipe',
          level: 'workspace-only',
          ecosystems: [],
          provides: ['workspace_feature.exists'],
          requires: [],
        },
      };

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('analysis.json')) {
          return JSON.stringify({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
            workspaceEcosystem: 'python',
            projects: [
              {
                path: '.',
                language: 'python',
                ecosystem: 'python',
                type: 'script',
                dependencies: [],
                hasPackageManager: true,
              },
            ],
          });
        }
        if (filePath.includes('config.yaml')) {
          return yamlStringify(mockYamlData.config);
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('fix.md')) {
          return 'Apply the ecosystem-agnostic recipe to any workspace...';
        }
        return '';
      });

      setupSuccessfulQueryMock();

      const result = await performRecipesApply({
        recipe: 'agnostic-workspace-recipe',
      });

      expect(result).toBeDefined();
      expect(result.summary.successfulProjects).toBe(1);
      expect(result.summary.totalProjects).toBe(1);
      expect(result.executionResults[0]?.projectPath).toBe('workspace');
    });

    describe('Re-application Prevention Tests', () => {
      const setupReApplicationScenario = (stateData: object) => {
        setupStandardFileSystemMocks();
        setupSuccessfulQueryMock();

        mockExistsSync.mockImplementation((path) => {
          if (path.includes('analysis.json')) {
            return true;
          }
          if (path.includes('state.json')) {
            return true;
          }
          if (path.includes('.chorenzo/recipes')) {
            return true;
          }
          if (path.includes('test-recipe')) {
            return true;
          }
          if (path.includes('metadata.yaml')) {
            return true;
          }
          if (path.includes('prompt.md')) {
            return true;
          }
          if (path.includes('apply_recipe.md')) {
            return true;
          }
          if (path.includes('fix.md')) {
            return true;
          }
          if (path.includes('variants')) {
            return true;
          }
          return true;
        });

        const mockYamlData = createMockYamlData({
          level: 'workspace-only',
          provides: ['test_feature.exists'],
        });

        mockReadFileSync.mockImplementation((filePath: string) => {
          if (filePath.includes('analysis.json')) {
            return JSON.stringify({
              isMonorepo: false,
              hasWorkspacePackageManager: false,
              workspaceEcosystem: Ecosystem.Javascript,
              projects: [
                {
                  path: '.',
                  language: 'javascript',
                  ecosystem: Ecosystem.Javascript,
                  type: ProjectType.WebApp,
                  dependencies: [],
                  hasPackageManager: true,
                },
              ],
            });
          }
          if (filePath.includes('config.yaml')) {
            return yamlStringify(mockYamlData.config);
          }
          if (filePath.includes('metadata.yaml')) {
            return yamlStringify(mockYamlData.metadata);
          }
          if (filePath.includes('prompt.md')) {
            return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
          }
          if (filePath.includes('apply_recipe.md')) {
            return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
          }
          if (filePath.includes('fix.md')) {
            return 'Basic fix prompt content';
          }
          if (filePath.includes('variants/basic.md')) {
            return 'Basic variant fix content';
          }
          if (filePath.includes('state.json')) {
            return JSON.stringify(stateData);
          }
          return '';
        });
      };

      it('should proceed normally when recipe has not been applied before', async () => {
        const stateData = {
          workspace: {},
          projects: {},
        };

        setupReApplicationScenario(stateData);

        const result = await performRecipesApply({
          recipe: 'test-recipe',
        });

        expect(result).toBeDefined();
        expect(result.summary.successfulProjects).toBe(1);
      });

      it('should detect re-application and show warning prompt', async () => {
        const stateData = {
          workspace: {
            'test-recipe.applied': true,
          },
          projects: {},
        };

        setupReApplicationScenario(stateData);

        await expect(
          performRecipesApply({
            recipe: 'test-recipe',
          })
        ).rejects.toThrow(
          'Recipe application cancelled by user due to previous application'
        );
      });

      it('should skip confirmation with --yes flag for re-application', async () => {
        const stateData = {
          workspace: {
            'test-recipe.applied': true,
          },
          projects: {},
        };

        setupReApplicationScenario(stateData);

        const result = await performRecipesApply({
          recipe: 'test-recipe',
          yes: true,
        });

        expect(result).toBeDefined();
        expect(result.summary.successfulProjects).toBe(1);
      });

      it('should skip confirmation with --force flag for re-application', async () => {
        const stateData = {
          workspace: {
            'test-recipe.applied': true,
          },
          projects: {},
        };
        setupReApplicationScenario(stateData);

        const result = await performRecipesApply({
          recipe: 'test-recipe',
          force: true,
        });

        expect(result).toBeDefined();
        expect(result.summary.successfulProjects).toBe(1);
      });
    });

    describe('Force Flag Tests', () => {
      const setupForceValidationTestScenario = (
        dependencies: RecipeDependency[] = []
      ) => {
        setupStandardFileSystemMocks();
        setupSuccessfulQueryMock();

        const mockYamlData = createMockYamlData({
          requires: dependencies,
        });

        mockReadFileSync.mockImplementation((filePath: string) => {
          if (filePath.includes('analysis.json')) {
            return JSON.stringify({
              isMonorepo: false,
              hasWorkspacePackageManager: false,
              workspaceEcosystem: Ecosystem.Javascript,
              projects: [
                {
                  path: '.',
                  language: 'javascript',
                  ecosystem: Ecosystem.Javascript,
                  type: ProjectType.WebApp,
                  dependencies: [],
                  hasPackageManager: true,
                },
              ],
            });
          }
          if (filePath.includes('config.yaml')) {
            return yamlStringify(mockYamlData.config);
          }
          if (filePath.includes('metadata.yaml')) {
            return yamlStringify(mockYamlData.metadata);
          }
          if (filePath.includes('prompt.md')) {
            return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
          }
          if (filePath.includes('fix.md')) {
            return 'Test fix content';
          }
          if (filePath.includes('apply_recipe.md.hbs')) {
            return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
          }
          if (
            filePath.includes(
              'apply_recipe_workspace_application_instructions.md.hbs'
            )
          ) {
            return 'workspace instructions';
          }
          if (
            filePath.includes('apply_recipe_workspace_state_management.md.hbs')
          ) {
            return 'workspace state management';
          }
          if (filePath.includes('state.json')) {
            return JSON.stringify({ workspace: {}, projects: {} });
          }
          return '';
        });

        createLibraryConfig('test-recipe');
      };

      it('should bypass validation with --force flag when dependencies not satisfied', async () => {
        setupForceValidationTestScenario([
          { key: 'prerequisite.missing_feature', equals: 'true' },
        ]);

        const result = await performRecipesApply({
          recipe: 'test-recipe',
          force: true,
        });

        expect(result).toBeDefined();
        expect(result.summary.successfulProjects).toBe(1);
      });

      it('should fail validation without --force flag when dependencies not satisfied', async () => {
        setupForceValidationTestScenario([
          { key: 'prerequisite.missing_feature', equals: 'true' },
        ]);

        await expect(
          performRecipesApply({
            recipe: 'test-recipe',
          })
        ).rejects.toThrow('cannot be applied due to unmet requirements');
      });

      it('should bypass project-level validation with --force flag', async () => {
        setupStandardFileSystemMocks();
        setupSuccessfulQueryMock();

        const mockYamlData = createMockYamlData({
          requires: [{ key: 'project.type', equals: 'library' }],
        });

        mockReadFileSync.mockImplementation((filePath: string) => {
          if (filePath.includes('analysis.json')) {
            return JSON.stringify({
              isMonorepo: false,
              hasWorkspacePackageManager: false,
              workspaceEcosystem: Ecosystem.Javascript,
              projects: [
                {
                  path: '.',
                  language: 'javascript',
                  ecosystem: Ecosystem.Javascript,
                  type: ProjectType.WebApp,
                  dependencies: [],
                  hasPackageManager: true,
                },
              ],
            });
          }
          if (filePath.includes('config.yaml')) {
            return yamlStringify(mockYamlData.config);
          }
          if (filePath.includes('metadata.yaml')) {
            return yamlStringify(mockYamlData.metadata);
          }
          if (filePath.includes('prompt.md')) {
            return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
          }
          if (filePath.includes('fix.md')) {
            return 'Test fix content';
          }
          if (filePath.includes('apply_recipe.md.hbs')) {
            return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
          }
          if (
            filePath.includes(
              'apply_recipe_project_application_instructions.md.hbs'
            )
          ) {
            return 'project instructions for {{ project_path }}';
          }
          if (
            filePath.includes('apply_recipe_project_state_management.md.hbs')
          ) {
            return 'project state management for {{ project_relative_path }}';
          }
          if (filePath.includes('state.json')) {
            return JSON.stringify({ workspace: {}, projects: {} });
          }
          return '';
        });

        createLibraryConfig('test-recipe');

        const result = await performRecipesApply({
          recipe: 'test-recipe',
          force: true,
        });

        expect(result).toBeDefined();
        expect(result.summary.successfulProjects).toBe(1);
      });
    });

    describe('Hierarchical Level Tests', () => {
      const setupHierarchicalLevelMocks = (recipeId: string) => {
        mockReaddirSync.mockImplementation((dirPath) => {
          if (dirPath.includes('.chorenzo/recipes')) {
            return [recipeId];
          }
          return [];
        });

        mockExistsSync.mockImplementation((path) => {
          if (path.includes('analysis.json')) {
            return true;
          }
          if (path.includes('state.json')) {
            return false;
          }
          if (path.includes('.chorenzo/recipes')) {
            return true;
          }
          if (path.includes(recipeId)) {
            return true;
          }
          if (path.includes('metadata.yaml')) {
            return true;
          }
          if (path.includes('prompt.md')) {
            return true;
          }
          return true;
        });
      };

      const setupHierarchicalLevelReadFileSync = (
        mockYamlData: ReturnType<typeof createMockYamlData>,
        analysisData: Record<string, unknown>
      ) => {
        mockReadFileSync.mockImplementation((filePath: string) => {
          if (filePath.includes('analysis.json')) {
            return JSON.stringify(analysisData);
          }
          if (filePath.includes('config.yaml')) {
            return yamlStringify(mockYamlData.config);
          }
          if (filePath.includes('metadata.yaml')) {
            return yamlStringify(mockYamlData.metadata);
          }
          if (filePath.includes('prompt.md')) {
            return '## Goal\nAdd formatter\n\n## Investigation\nCheck formatter\n\n## Expected Output\nFormatter configured';
          }
          if (filePath.includes('fix.md')) {
            return 'Basic fix prompt content';
          }
          if (filePath.includes('variants/basic.md')) {
            return 'Basic variant fix content';
          }
          if (filePath.includes('variants/black.md')) {
            return 'Black formatter fix content';
          }
          if (filePath.includes('variants/prettier.md')) {
            return 'Prettier formatter fix content';
          }
          if (filePath.includes('variants/gofmt.md')) {
            return 'Gofmt formatter fix content';
          }
          if (
            filePath.includes(
              'apply_recipe_workspace_application_instructions.md'
            )
          ) {
            return 'Apply {{ recipe_id }} at workspace level...';
          }
          if (
            filePath.includes(
              'apply_recipe_project_application_instructions.md'
            )
          ) {
            return 'Apply {{ recipe_id }} to {{ project_path }}...';
          }
          return '';
        });
      };

      it('should apply workspace-preferred recipe at workspace level when ecosystem is supported', async () => {
        setupStandardApplyScenario();
        setupHierarchicalLevelMocks('workspace-preferred-recipe');

        const mockYamlData = createMockYamlData({
          recipeId: 'workspace-preferred-recipe',
          level: 'workspace-preferred' as const,
          provides: ['formatter.exists'],
        });
        (mockYamlData.config.libraries as Record<string, unknown>)[
          'workspace-preferred-recipe'
        ] = createLibraryConfig('workspace-preferred-recipe');

        const analysisData = {
          isMonorepo: false,
          hasWorkspacePackageManager: true,
          workspaceEcosystem: Ecosystem.Javascript,
          projects: [
            {
              path: '/workspace/app',
              language: 'javascript',
              ecosystem: Ecosystem.Javascript,
              type: 'application',
              dependencies: [],
              hasPackageManager: true,
            },
          ],
        };

        setupHierarchicalLevelReadFileSync(mockYamlData, analysisData);

        const result = await performRecipesApply({
          recipe: 'workspace-preferred-recipe',
        });

        expect(result.executionResults).toHaveLength(1);
        expect(result.executionResults[0]?.success).toBe(true);
        expect(result.executionResults[0]?.projectPath).toBe('workspace');
      });

      it('should apply workspace-preferred recipe at project level when workspace ecosystem not supported', async () => {
        setupStandardApplyScenario();
        setupHierarchicalLevelMocks('workspace-preferred-recipe');

        const mockYamlData = createMockYamlData({
          recipeId: 'workspace-preferred-recipe',
          level: 'workspace-preferred' as const,
          provides: ['formatter.exists'],
        });
        (mockYamlData.config.libraries as Record<string, unknown>)[
          'workspace-preferred-recipe'
        ] = createLibraryConfig('workspace-preferred-recipe');

        mockYamlData.metadata.ecosystems = [
          {
            id: 'python',
            default_variant: 'black',
            variants: [{ id: 'black', fix_prompt: 'variants/black.md' }],
          },
        ];

        const analysisData = {
          isMonorepo: true,
          hasWorkspacePackageManager: true,
          workspaceEcosystem: Ecosystem.Javascript,
          projects: [
            {
              path: '/workspace/python-service',
              language: 'python',
              ecosystem: 'python',
              type: 'service',
              dependencies: [],
              hasPackageManager: true,
            },
          ],
        };

        setupHierarchicalLevelReadFileSync(mockYamlData, analysisData);

        const result = await performRecipesApply({
          recipe: 'workspace-preferred-recipe',
        });

        expect(result.executionResults).toHaveLength(1);
        expect(result.executionResults[0]?.success).toBe(true);
        expect(result.executionResults[0]?.projectPath).toContain(
          'python-service'
        );
      });

      it('should apply workspace-preferred recipe to mixed ecosystems (workspace + projects)', async () => {
        setupStandardApplyScenario();
        setupHierarchicalLevelMocks('multi-ecosystem-recipe');

        const mockYamlData = createMockYamlData({
          recipeId: 'multi-ecosystem-recipe',
          level: 'workspace-preferred' as const,
          provides: ['formatter.exists'],
        });
        (mockYamlData.config.libraries as Record<string, unknown>)[
          'multi-ecosystem-recipe'
        ] = createLibraryConfig('multi-ecosystem-recipe');

        mockYamlData.metadata.ecosystems = [
          {
            id: 'javascript',
            default_variant: 'prettier',
            variants: [{ id: 'prettier', fix_prompt: 'variants/prettier.md' }],
          },
          {
            id: 'python',
            default_variant: 'black',
            variants: [{ id: 'black', fix_prompt: 'variants/black.md' }],
          },
        ];

        const analysisData = {
          isMonorepo: true,
          hasWorkspacePackageManager: true,
          workspaceEcosystem: Ecosystem.Javascript,
          projects: [
            {
              path: '/workspace/frontend',
              language: 'javascript',
              ecosystem: Ecosystem.Javascript,
              type: 'application',
              dependencies: [],
              hasPackageManager: true,
            },
            {
              path: '/workspace/python-service',
              language: 'python',
              ecosystem: 'python',
              type: 'service',
              dependencies: [],
              hasPackageManager: true,
            },
          ],
        };

        setupHierarchicalLevelReadFileSync(mockYamlData, analysisData);

        const result = await performRecipesApply({
          recipe: 'multi-ecosystem-recipe',
        });

        expect(result.executionResults).toHaveLength(2);
        expect(result.executionResults.every((r) => r.success)).toBe(true);
        expect(
          result.executionResults.find((r) => r.projectPath === 'workspace')
        ).toBeDefined();
        expect(
          result.executionResults.find((r) =>
            r.projectPath.includes('python-service')
          )
        ).toBeDefined();
      });

      it('should handle workspace-preferred recipe with no applicable scope', async () => {
        setupStandardApplyScenario();
        setupHierarchicalLevelMocks('unsupported-recipe');

        const mockYamlData = createMockYamlData({
          recipeId: 'unsupported-recipe',
          level: 'workspace-preferred' as const,
          provides: ['feature.exists'],
        });
        (mockYamlData.config.libraries as Record<string, unknown>)[
          'unsupported-recipe'
        ] = createLibraryConfig('unsupported-recipe');

        mockYamlData.metadata.ecosystems = [
          {
            id: 'go',
            default_variant: 'gofmt',
            variants: [{ id: 'gofmt', fix_prompt: 'variants/gofmt.md' }],
          },
        ];

        const analysisData = {
          isMonorepo: false,
          hasWorkspacePackageManager: true,
          workspaceEcosystem: Ecosystem.Javascript,
          projects: [
            {
              path: '/workspace/app',
              language: 'javascript',
              ecosystem: Ecosystem.Javascript,
              type: 'application',
              dependencies: [],
              hasPackageManager: true,
            },
          ],
        };

        setupHierarchicalLevelReadFileSync(mockYamlData, analysisData);

        await expect(
          performRecipesApply({
            recipe: 'unsupported-recipe',
          })
        ).rejects.toThrow('cannot be applied: workspace ecosystem mismatch');
      });

      it('should handle project-only recipe correctly', async () => {
        setupStandardApplyScenario();
        setupHierarchicalLevelMocks('project-only-recipe');

        const mockYamlData = createMockYamlData({
          recipeId: 'project-only-recipe',
          level: 'project-only' as const,
          provides: ['project-only-recipe.feature'],
        });
        (mockYamlData.config.libraries as Record<string, unknown>)[
          'project-only-recipe'
        ] = createLibraryConfig('project-only-recipe');

        const analysisData = {
          isMonorepo: false,
          hasWorkspacePackageManager: true,
          workspaceEcosystem: Ecosystem.Javascript,
          projects: [
            {
              path: '/workspace/app',
              language: 'javascript',
              ecosystem: Ecosystem.Javascript,
              type: 'application',
              dependencies: [],
              hasPackageManager: true,
            },
          ],
        };

        setupHierarchicalLevelReadFileSync(mockYamlData, analysisData);

        const result = await performRecipesApply({
          recipe: 'project-only-recipe',
        });

        expect(result.executionResults).toHaveLength(1);
        expect(result.executionResults[0]?.success).toBe(true);
        expect(result.executionResults[0]?.projectPath).toContain('app');
      });

      it('should handle workspace-only recipe correctly', async () => {
        setupStandardApplyScenario();
        setupHierarchicalLevelMocks('workspace-only-recipe');

        const mockYamlData = createMockYamlData({
          recipeId: 'workspace-only-recipe',
          level: 'workspace-only' as const,
          provides: ['workspace-only-recipe.feature'],
        });
        (mockYamlData.config.libraries as Record<string, unknown>)[
          'workspace-only-recipe'
        ] = createLibraryConfig('workspace-only-recipe');

        const analysisData = {
          isMonorepo: false,
          hasWorkspacePackageManager: true,
          workspaceEcosystem: Ecosystem.Javascript,
          projects: [
            {
              path: '/workspace/app',
              language: 'javascript',
              ecosystem: Ecosystem.Javascript,
              type: 'application',
              dependencies: [],
              hasPackageManager: true,
            },
          ],
        };

        setupHierarchicalLevelReadFileSync(mockYamlData, analysisData);

        const result = await performRecipesApply({
          recipe: 'workspace-only-recipe',
        });

        expect(result.executionResults).toHaveLength(1);
        expect(result.executionResults[0]?.success).toBe(true);
        expect(result.executionResults[0]?.projectPath).toBe('workspace');

        expect(mockWriteFileAtomicSync).toHaveBeenCalled();
        const writeCall = mockWriteFileAtomicSync.mock.calls.find((call) =>
          (call[0] as string).includes('state.json')
        );
        expect(writeCall).toBeDefined();
        if (writeCall) {
          const stateContent = JSON.parse(writeCall[1] as string);
          expect(stateContent.workspace['workspace-only-recipe.applied']).toBe(
            true
          );
        }
      });

      it('should apply recipe with project.ecosystem requirement', async () => {
        setupStandardApplyScenario();
        setupHierarchicalLevelMocks('project-ecosystem-recipe');

        const mockYamlData = createMockYamlData({
          recipeId: 'project-ecosystem-recipe',
          level: 'project-only' as const,
          requires: [{ key: 'project.ecosystem', equals: 'python' }],
          provides: ['project-ecosystem-recipe.configured'],
        });

        mockYamlData.metadata.ecosystems = [
          {
            id: 'python',
            default_variant: 'basic',
            variants: [{ id: 'basic', fix_prompt: 'variants/basic.md' }],
          },
        ];
        (mockYamlData.config.libraries as Record<string, unknown>)[
          'project-ecosystem-recipe'
        ] = createLibraryConfig('project-ecosystem-recipe');

        mockReadFileSync.mockImplementation((filePath: string) => {
          if (filePath.includes('analysis.json')) {
            return JSON.stringify({
              isMonorepo: true,
              hasWorkspacePackageManager: true,
              workspaceEcosystem: Ecosystem.Javascript,
              projects: [
                {
                  path: '/workspace/python-app',
                  language: 'python',
                  ecosystem: 'python',
                  type: ProjectType.WebApp,
                  dependencies: [],
                  hasPackageManager: true,
                },
                {
                  path: '/workspace/js-app',
                  language: 'javascript',
                  ecosystem: Ecosystem.Javascript,
                  type: ProjectType.WebApp,
                  dependencies: [],
                  hasPackageManager: true,
                },
              ],
            });
          }
          if (filePath.includes('config.yaml')) {
            return yamlStringify(mockYamlData.config);
          }
          if (filePath.includes('metadata.yaml')) {
            return yamlStringify(mockYamlData.metadata);
          }
          if (filePath.includes('prompt.md')) {
            return '## Goal\nAdd formatter\n\n## Investigation\nCheck formatter\n\n## Expected Output\nFormatter configured';
          }
          if (
            filePath.includes(
              'apply_recipe_project_application_instructions.md'
            )
          ) {
            return 'Apply {{ recipe_id }} to {{ project_path }}...';
          }
          return '';
        });

        mockQuery.mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'Recipe applied successfully' }],
            },
          };
        });

        const result = await performRecipesApply({
          recipe: 'project-ecosystem-recipe',
        });

        expect(result.executionResults).toHaveLength(1);
        expect(result.executionResults[0]?.projectPath).toContain('python-app');
      });

      it('should apply recipe with project.type requirement', async () => {
        setupStandardApplyScenario();
        setupHierarchicalLevelMocks('project-type-recipe');

        const mockYamlData = createMockYamlData({
          recipeId: 'project-type-recipe',
          level: 'project-only' as const,
          requires: [{ key: 'project.type', equals: 'api_server' }],
          provides: ['project-type-recipe.configured'],
        });

        mockYamlData.metadata.ecosystems = [
          {
            id: 'javascript',
            default_variant: 'basic',
            variants: [{ id: 'basic', fix_prompt: 'variants/basic.md' }],
          },
        ];
        (mockYamlData.config.libraries as Record<string, unknown>)[
          'project-type-recipe'
        ] = createLibraryConfig('project-type-recipe');

        mockReadFileSync.mockImplementation((filePath: string) => {
          if (filePath.includes('analysis.json')) {
            return JSON.stringify({
              isMonorepo: true,
              hasWorkspacePackageManager: true,
              workspaceEcosystem: Ecosystem.Javascript,
              projects: [
                {
                  path: '/workspace/api',
                  language: 'javascript',
                  ecosystem: Ecosystem.Javascript,
                  type: 'api_server',
                  dependencies: [],
                  hasPackageManager: true,
                },
                {
                  path: '/workspace/frontend',
                  language: 'javascript',
                  ecosystem: Ecosystem.Javascript,
                  type: ProjectType.WebApp,
                  dependencies: [],
                  hasPackageManager: true,
                },
              ],
            });
          }
          if (filePath.includes('config.yaml')) {
            return yamlStringify(mockYamlData.config);
          }
          if (filePath.includes('metadata.yaml')) {
            return yamlStringify(mockYamlData.metadata);
          }
          if (filePath.includes('prompt.md')) {
            return '## Goal\nAdd formatter\n\n## Investigation\nCheck formatter\n\n## Expected Output\nFormatter configured';
          }
          if (
            filePath.includes(
              'apply_recipe_project_application_instructions.md'
            )
          ) {
            return 'Apply {{ recipe_id }} to {{ project_path }}...';
          }
          return '';
        });

        mockQuery.mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'Recipe applied successfully' }],
            },
          };
        });

        const result = await performRecipesApply({
          recipe: 'project-type-recipe',
        });

        expect(result.executionResults).toHaveLength(1);
        expect(result.executionResults[0]?.projectPath).toContain('api');
      });

      it('should apply recipe with workspace.is_monorepo requirement', async () => {
        setupStandardApplyScenario();
        setupHierarchicalLevelMocks('workspace-monorepo-recipe');

        const mockYamlData = createMockYamlData({
          recipeId: 'workspace-monorepo-recipe',
          level: 'workspace-preferred' as const,
          requires: [{ key: 'workspace.is_monorepo', equals: 'true' }],
          provides: ['workspace-monorepo-recipe.configured'],
        });

        mockYamlData.metadata.ecosystems = [
          {
            id: 'javascript',
            default_variant: 'basic',
            variants: [{ id: 'basic', fix_prompt: 'variants/basic.md' }],
          },
        ];
        (mockYamlData.config.libraries as Record<string, unknown>)[
          'workspace-monorepo-recipe'
        ] = createLibraryConfig('workspace-monorepo-recipe');

        mockReadFileSync.mockImplementation((filePath: string) => {
          if (filePath.includes('analysis.json')) {
            return JSON.stringify({
              isMonorepo: true,
              hasWorkspacePackageManager: true,
              workspaceEcosystem: Ecosystem.Javascript,
              projects: [
                {
                  path: '/workspace/app1',
                  language: 'javascript',
                  ecosystem: Ecosystem.Javascript,
                  type: ProjectType.WebApp,
                  dependencies: [],
                  hasPackageManager: true,
                },
                {
                  path: '/workspace/app2',
                  language: 'javascript',
                  ecosystem: Ecosystem.Javascript,
                  type: ProjectType.WebApp,
                  dependencies: [],
                  hasPackageManager: true,
                },
              ],
            });
          }
          if (filePath.includes('config.yaml')) {
            return yamlStringify(mockYamlData.config);
          }
          if (filePath.includes('metadata.yaml')) {
            return yamlStringify(mockYamlData.metadata);
          }
          if (filePath.includes('prompt.md')) {
            return '## Goal\nAdd formatter\n\n## Investigation\nCheck formatter\n\n## Expected Output\nFormatter configured';
          }
          if (
            filePath.includes(
              'apply_recipe_workspace_application_instructions.md'
            )
          ) {
            return 'Apply {{ recipe_id }} at workspace level...';
          }
          return '';
        });

        mockQuery.mockImplementation(function* () {
          yield {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'Recipe applied successfully' }],
            },
          };
        });

        const result = await performRecipesApply({
          recipe: 'workspace-monorepo-recipe',
        });

        expect(result.executionResults.length).toBeGreaterThan(0);
        expect(
          result.executionResults.some((r) => r.projectPath === 'workspace')
        ).toBe(true);
      });

      it('should reject recipe when project characteristics do not match', async () => {
        setupStandardApplyScenario();
        setupHierarchicalLevelMocks('project-framework-recipe');

        const mockYamlData = createMockYamlData({
          recipeId: 'project-framework-recipe',
          level: 'project-only' as const,
          requires: [{ key: 'project.framework', equals: 'react' }],
          provides: ['project-framework-recipe.configured'],
        });

        mockYamlData.metadata.ecosystems = [
          {
            id: 'javascript',
            default_variant: 'basic',
            variants: [{ id: 'basic', fix_prompt: 'variants/basic.md' }],
          },
        ];
        (mockYamlData.config.libraries as Record<string, unknown>)[
          'project-framework-recipe'
        ] = createLibraryConfig('project-framework-recipe');

        mockReadFileSync.mockImplementation((filePath: string) => {
          if (filePath.includes('analysis.json')) {
            return JSON.stringify({
              isMonorepo: false,
              hasWorkspacePackageManager: true,
              workspaceEcosystem: Ecosystem.Javascript,
              projects: [
                {
                  path: '/workspace/vue-app',
                  language: 'javascript',
                  ecosystem: Ecosystem.Javascript,
                  type: ProjectType.WebApp,
                  framework: 'vue',
                  dependencies: [],
                  hasPackageManager: true,
                },
              ],
            });
          }
          if (filePath.includes('config.yaml')) {
            return yamlStringify(mockYamlData.config);
          }
          if (filePath.includes('metadata.yaml')) {
            return yamlStringify(mockYamlData.metadata);
          }
          if (filePath.includes('prompt.md')) {
            return '## Goal\nAdd formatter\n\n## Investigation\nCheck formatter\n\n## Expected Output\nFormatter configured';
          }
          if (
            filePath.includes(
              'apply_recipe_project_application_instructions.md'
            )
          ) {
            return 'Apply {{ recipe_id }} to {{ project_path }}...';
          }
          return '';
        });

        await expect(
          performRecipesApply({
            recipe: 'project-framework-recipe',
          })
        ).rejects.toThrow('No applicable projects found');
      });
    });
  });
});
