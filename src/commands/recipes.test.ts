import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import * as fs from 'fs';
import { stringify as yamlStringify } from 'yaml';

const mockHomedir = jest.fn<() => string>(() => '/test/home');
const mockTmpdir = jest.fn<() => string>(() => '/tmp');
const mockExistsSync = jest.fn<(path: string) => boolean>();
const mockStatSync = jest.fn<(path: string) => fs.Stats>();
const mockReaddirSync = jest.fn<(path: string) => string[]>();
const mockReadFileSync = jest.fn<(path: string, encoding?: string) => string>();
const mockQuery = jest.fn();
const mockPerformAnalysis =
  jest.fn<() => Promise<import('./analyze').AnalysisResult>>();
const mockRmSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockAppendFileSync = jest.fn();
const mockCreateWriteStream = jest.fn();

jest.unstable_mockModule('os', () => ({
  homedir: mockHomedir,
  tmpdir: mockTmpdir,
}));

jest.unstable_mockModule('fs', () => ({
  existsSync: mockExistsSync,
  statSync: mockStatSync,
  readdirSync: mockReaddirSync,
  readFileSync: mockReadFileSync,
  rmSync: mockRmSync,
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
  appendFileSync: mockAppendFileSync,
  createWriteStream: mockCreateWriteStream,
}));

jest.unstable_mockModule('@anthropic-ai/claude-code', () => ({
  query: mockQuery,
}));

jest.unstable_mockModule('./analyze', () => ({
  performAnalysis: mockPerformAnalysis,
}));

jest.unstable_mockModule('simple-git', () => ({
  simpleGit: jest.fn(() => ({
    fetch: jest
      .fn<(remote: string, ref: string) => Promise<void>>()
      .mockResolvedValue(void 0),
    reset: jest
      .fn<(options: string[]) => Promise<void>>()
      .mockResolvedValue(void 0),
    clone: jest
      .fn<
        (
          repoUrl: string,
          targetPath: string,
          options?: string[]
        ) => Promise<void>
      >()
      .mockResolvedValue(void 0),
    raw: jest
      .fn<(args: string[]) => Promise<string>>()
      .mockResolvedValue('git version 2.0.0'),
  })),
}));

describe('Recipes Command Integration Tests', () => {
  let performRecipesValidate: typeof import('./recipes').performRecipesValidate;
  let performRecipesApply: typeof import('./recipes').performRecipesApply;

  const createMockYamlData = (
    options: {
      recipeId?: string;
      category?: string;
      level?: 'workspace-only' | 'project-only' | 'workspace-preferred';
      variants?: Array<{ id: string; fix_prompt: string }>;
      requires?: Array<{ key: string; equals: string }>;
      provides?: string[];
    } = {}
  ) => {
    const {
      recipeId = 'test-recipe',
      category = 'test',
      level = 'project-only',
      variants = [{ id: 'basic', fix_prompt: 'fixes/basic.md' }],
      requires = [],
      provides = ['test-functionality'],
    } = options;

    return {
      config: {
        libraries: {
          'test-recipe': {
            repo: 'https://github.com/test/test-recipe.git',
            ref: 'main',
          },
        },
      },
      metadata: {
        id: recipeId,
        category,
        summary: 'Test recipe',
        level,
        ecosystems: [
          {
            id: 'javascript',
            default_variant: 'basic',
            variants,
          },
        ],
        provides,
        requires,
      },
    };
  };

  const setupDefaultMocks = () => {
    mockHomedir.mockImplementation(() => '/test/home');
    mockTmpdir.mockImplementation(() => '/tmp');
    mockExistsSync.mockImplementation(() => {
      return true;
    });
    mockStatSync.mockImplementation(
      () =>
        ({
          isDirectory: () => true,
          isFile: () => false,
        }) as fs.Stats
    );
    mockReaddirSync.mockImplementation(() => []);
    const mockYamlData = createMockYamlData();
    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('prompt.md')) {
        return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
      } else if (filePath.includes('fixes/basic.md')) {
        return 'Basic fix prompt content';
      } else if (filePath.includes('plan') && filePath.includes('.md')) {
        return `title: "test plan"
steps:
  - type: configure
    description: test
outputs:
  test_feature.exists: true`;
      } else if (filePath.includes('config.yaml')) {
        return yamlStringify(mockYamlData.config);
      } else if (filePath.includes('metadata.yaml')) {
        return yamlStringify(mockYamlData.metadata);
      } else if (
        filePath.includes('apply_recipe_workspace_application_instructions.md')
      ) {
        return 'Apply this workspace-level recipe...';
      } else if (
        filePath.includes('apply_recipe_project_application_instructions.md')
      ) {
        return 'Apply this project-level recipe to {{ project_path }}...';
      } else if (
        filePath.includes('apply_recipe_workspace_state_management.md')
      ) {
        return 'Update workspace state at {{ workspace_root }}/.chorenzo/state.json...';
      } else if (
        filePath.includes('apply_recipe_project_state_management.md')
      ) {
        return 'Update project state for {{ project_relative_path }} at {{ workspace_root }}/.chorenzo/state.json...';
      } else if (filePath.includes('.json')) {
        return '{}';
      }
      return '';
    });
    mockCreateWriteStream.mockImplementation(() => ({
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
    }));
    mockRmSync.mockImplementation(() => {});
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    setupDefaultMocks();

    const recipesModule = await import('./recipes');
    performRecipesValidate = recipesModule.performRecipesValidate;
    performRecipesApply = recipesModule.performRecipesApply;
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('should detect recipe folder input type', async () => {
    const options = { target: '/path/to/recipe' };

    const recipeData = {
      id: 'recipe',
      category: 'test',
      summary: 'Test recipe',
      level: 'project-only',
      ecosystems: [
        {
          id: 'javascript',
          default_variant: 'basic',
          variants: [
            {
              id: 'basic',
              fix_prompt: 'fixes/basic.md',
            },
          ],
        },
      ],
      provides: ['test-functionality'],
      requires: [],
    };

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('prompt.md')) {
        return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
      } else if (filePath.includes('fixes/basic.md')) {
        return 'Basic fix prompt content';
      } else if (filePath.includes('metadata.yaml')) {
        return yamlStringify(recipeData);
      }
      return '';
    });

    const mockProgress = jest.fn();
    const result = await performRecipesValidate(options, mockProgress);

    expect(result.context.inputType).toBe('recipe-folder');
    expect(result.context.target).toBe('/path/to/recipe');
    expect(result.context.resolvedPath).toBe('/path/to/recipe');
    expect(result.context.recipesValidated).toEqual(['recipe']);
    expect(result.messages).toBeDefined();
    expect(
      result.messages.some(
        (msg) =>
          msg.type === 'success' &&
          msg.text.includes("Recipe 'recipe' is valid")
      )
    ).toBe(true);
    expect(mockProgress).toHaveBeenCalledWith(
      'Validating recipe folder: /path/to/recipe'
    );
  });

  it('should detect library input type', async () => {
    const options = { target: '/path/to/library' };

    mockExistsSync.mockImplementation((filePath: string) => {
      if (filePath === '/path/to/library') return true;
      if (filePath === '/path/to/library/metadata.yaml') return false;
      if (filePath === '/path/to/library/recipe1') return true;
      if (filePath === '/path/to/library/recipe2') return true;
      if (filePath === '/path/to/library/recipe1/metadata.yaml') return true;
      if (filePath === '/path/to/library/recipe2/metadata.yaml') return true;
      if (filePath === '/path/to/library/recipe1/prompt.md') return true;
      if (filePath === '/path/to/library/recipe2/prompt.md') return true;
      if (filePath === '/path/to/library/recipe1/fixes') return true;
      if (filePath === '/path/to/library/recipe2/fixes') return true;
      if (filePath === '/path/to/library/recipe1/fixes/basic.md') return true;
      if (filePath === '/path/to/library/recipe2/fixes/basic.md') return true;
      return false;
    });

    mockStatSync.mockImplementation(
      (filePath: string) =>
        ({
          isDirectory: () => !filePath.includes('.'),
          isFile: () => filePath.includes('.'),
        }) as fs.Stats
    );

    mockReaddirSync.mockImplementation((dirPath: string) => {
      if (dirPath === '/path/to/library') {
        return ['recipe1', 'recipe2'];
      }
      return [];
    });

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('prompt.md')) {
        return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
      } else if (filePath.includes('fixes/basic.md')) {
        return 'Basic fix prompt content';
      } else if (filePath.includes('recipe1/metadata.yaml')) {
        return yamlStringify({
          id: 'recipe1',
          category: 'test',
          summary: 'Recipe 1',
          level: 'project-only',
          ecosystems: [
            {
              id: 'javascript',
              default_variant: 'basic',
              variants: [{ id: 'basic', fix_prompt: 'fixes/basic.md' }],
            },
          ],
          provides: ['feature1'],
          requires: [],
        });
      } else if (filePath.includes('recipe2/metadata.yaml')) {
        return yamlStringify({
          id: 'recipe2',
          category: 'test',
          summary: 'Recipe 2',
          level: 'project-only',
          ecosystems: [
            {
              id: 'python',
              default_variant: 'basic',
              variants: [{ id: 'basic', fix_prompt: 'fixes/basic.md' }],
            },
          ],
          provides: ['feature2'],
          requires: [],
        });
      }
      return '';
    });

    const mockProgress = jest.fn();
    const result = await performRecipesValidate(options, mockProgress);

    expect(result.context.inputType).toBe('library');
    expect(result.context.target).toBe('/path/to/library');
    expect(result.context.resolvedPath).toBe('/path/to/library');
    expect(result.context.recipesValidated).toEqual(
      expect.arrayContaining(['recipe1', 'recipe2'])
    );
    expect(result.summary).toBeDefined();
    expect(result.summary!.total).toBe(2);
    expect(result.summary!.valid).toBe(2);
    expect(mockProgress).toHaveBeenCalledWith(
      'This will validate all recipes in the library: /path/to/library'
    );
  });

  it('should handle recipe search in nested directories', async () => {
    const options = { target: 'nested-recipe' };

    mockExistsSync.mockImplementation((filePath: string) => {
      if (filePath === '/test/home/.chorenzo/recipes') return true;
      if (filePath === '/test/home/.chorenzo/recipes/lib1') return true;
      if (filePath === '/test/home/.chorenzo/recipes/lib2') return true;
      if (filePath === '/test/home/.chorenzo/recipes/lib1/nested-recipe')
        return true;
      if (
        filePath ===
        '/test/home/.chorenzo/recipes/lib1/nested-recipe/metadata.yaml'
      )
        return true;
      if (
        filePath === '/test/home/.chorenzo/recipes/lib1/nested-recipe/prompt.md'
      )
        return true;
      if (filePath === '/test/home/.chorenzo/recipes/lib1/nested-recipe/fixes')
        return true;
      if (
        filePath ===
        '/test/home/.chorenzo/recipes/lib1/nested-recipe/fixes/basic.md'
      )
        return true;
      return false;
    });

    mockStatSync.mockImplementation(
      (filePath: string) =>
        ({
          isDirectory: () => {
            return (
              filePath === '/test/home/.chorenzo/recipes' ||
              filePath === '/test/home/.chorenzo/recipes/lib1' ||
              filePath === '/test/home/.chorenzo/recipes/lib2' ||
              filePath === '/test/home/.chorenzo/recipes/lib1/nested-recipe'
            );
          },
          isFile: () => filePath.includes('.'),
        }) as fs.Stats
    );

    mockReaddirSync.mockImplementation((dirPath: string) => {
      if (dirPath === '/test/home/.chorenzo/recipes') {
        return ['lib1', 'lib2'];
      } else if (dirPath === '/test/home/.chorenzo/recipes/lib1') {
        return ['nested-recipe'];
      } else if (dirPath === '/test/home/.chorenzo/recipes/lib2') {
        return [];
      }
      return [];
    });

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('prompt.md')) {
        return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
      } else if (filePath.includes('fixes/basic.md')) {
        return 'Basic fix prompt content';
      } else if (filePath.includes('metadata.yaml')) {
        return yamlStringify({
          id: 'nested-recipe',
          category: 'test',
          summary: 'Nested recipe',
          level: 'project-only',
          ecosystems: [
            {
              id: 'javascript',
              default_variant: 'basic',
              variants: [
                {
                  id: 'basic',
                  fix_prompt: 'fixes/basic.md',
                },
              ],
            },
          ],
          provides: ['nested-functionality'],
          requires: [],
        });
      }
      return '';
    });

    const mockProgress = jest.fn();
    const result = await performRecipesValidate(options, mockProgress);

    expect(result.context.inputType).toBe('recipe-name');
    expect(result.context.target).toBe('nested-recipe');
    expect(result.context.resolvedPath).toBe('nested-recipe');
    expect(result.context.recipesValidated).toEqual(['nested-recipe']);
    expect(result.messages).toBeDefined();
    expect(
      result.messages.some(
        (msg) =>
          msg.type === 'success' &&
          msg.text.includes("Recipe 'nested-recipe' is valid")
      )
    ).toBe(true);
    expect(mockProgress).toHaveBeenCalledWith(
      'Searching for recipe: nested-recipe'
    );
  });

  it('should detect git URL input type', async () => {
    const options = { target: 'https://github.com/user/recipes.git' };

    const mockProgress = jest.fn();
    const result = await performRecipesValidate(options, mockProgress);

    expect(result.context.inputType).toBe('git-url');
    expect(result.context.target).toBe('https://github.com/user/recipes.git');
    expect(result.context.resolvedPath).toBe(
      'https://github.com/user/recipes.git'
    );
    expect(result.summary).toBeDefined();
    expect(result.summary!.total).toBe(0);
    expect(mockProgress).toHaveBeenCalledWith(
      'This will clone and validate recipes from: https://github.com/user/recipes.git'
    );
    expect(mockProgress).toHaveBeenCalledWith('Cloning repository...');
    expect(mockProgress).toHaveBeenCalledWith('Validating cloned recipes...');
  });

  it('should handle path resolution with tilde', async () => {
    const options = { target: '~/my-recipes/test-recipe' };

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('prompt.md')) {
        return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
      } else if (filePath.includes('fixes/basic.md')) {
        return 'Basic fix prompt content';
      } else if (filePath.includes('metadata.yaml')) {
        return yamlStringify({
          id: 'test-recipe',
          category: 'test',
          summary: 'Test recipe',
          level: 'project-only',
          ecosystems: [
            {
              id: 'javascript',
              default_variant: 'basic',
              variants: [
                {
                  id: 'basic',
                  fix_prompt: 'fixes/basic.md',
                },
              ],
            },
          ],
          provides: ['test-functionality'],
          requires: [],
        });
      }
      return '';
    });

    const mockProgress = jest.fn();
    const result = await performRecipesValidate(options, mockProgress);

    expect(result.context.target).toBe('~/my-recipes/test-recipe');
    expect(result.context.resolvedPath).toBe(
      '/test/home/my-recipes/test-recipe'
    );
    expect(result.context.inputType).toBe('recipe-folder');
    expect(mockProgress).toHaveBeenCalledWith(
      'Validating recipe folder: /test/home/my-recipes/test-recipe'
    );
  });

  describe('Recipes Validation', () => {
    it('should throw error when target parameter is missing', async () => {
      const options = { target: '' };

      await expect(performRecipesValidate(options)).rejects.toThrow(
        'Target parameter is required for validation'
      );
    });

    it('should handle recipe not found by name', async () => {
      const options = { target: 'nonexistent-recipe' };

      mockExistsSync.mockImplementation((filePath: string) => {
        if (filePath === '/test/home/.chorenzo/recipes') return true;
        if (filePath === '/test/home/.chorenzo/recipes/other-recipe')
          return true;
        if (
          filePath === '/test/home/.chorenzo/recipes/other-recipe/metadata.yaml'
        )
          return true;
        return false;
      });

      mockStatSync.mockImplementation(
        (filePath: string) =>
          ({
            isDirectory: () => !filePath.includes('.'),
            isFile: () => filePath.includes('.'),
          }) as fs.Stats
      );

      mockReaddirSync.mockImplementation((dirPath: string) => {
        if (dirPath === '/test/home/.chorenzo/recipes') {
          return ['other-recipe'];
        }
        return [];
      });

      await expect(performRecipesValidate(options)).rejects.toThrow(
        "Recipe 'nonexistent-recipe' not found in ~/.chorenzo/recipes"
      );
    });

    it('should handle YAML parsing errors', async () => {
      const options = { target: '/path/to/broken-recipe' };

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('metadata.yaml')) {
          return 'invalid: yaml: content: [unclosed';
        }
        return '';
      });

      await expect(performRecipesValidate(options)).rejects.toThrow(
        'Failed to parse metadata.yaml'
      );
    });

    it('should handle missing required files', async () => {
      const options = { target: '/path/to/incomplete-recipe' };

      mockExistsSync.mockImplementation((filePath: string) => {
        return (
          filePath === '/path/to/incomplete-recipe' ||
          filePath.includes('metadata.yaml') ||
          !filePath.includes('prompt.md')
        );
      });

      await expect(performRecipesValidate(options)).rejects.toThrow(
        'Missing prompt.md in recipe'
      );
    });

    it('should warn about non-kebab-case recipe ID', async () => {
      const options = { target: '/path/to/snake_case_recipe' };

      mockExistsSync.mockImplementation(() => true);
      mockStatSync.mockImplementation(
        () =>
          ({
            isDirectory: () => true,
            isFile: () => false,
          }) as fs.Stats
      );
      mockReaddirSync.mockImplementation(() => []);
      mockReadFileSync.mockImplementation((filePath) => {
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
        return '';
      });

      const mockYamlData = createMockYamlData({
        recipeId: 'snake_case_recipe',
        provides: ['test_feature'],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        return '';
      });

      const result = await performRecipesValidate(options);

      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'warning' &&
            msg.text.includes(
              'Recipe ID should use kebab-case (lowercase letters, numbers, and hyphens only)'
            )
        )
      ).toBe(true);
    });

    it('should warn about non-kebab-case recipe category', async () => {
      const options = { target: '/path/to/test-recipe' };

      mockExistsSync.mockImplementation(() => true);
      mockStatSync.mockImplementation(
        () =>
          ({
            isDirectory: () => true,
            isFile: () => false,
          }) as fs.Stats
      );
      mockReaddirSync.mockImplementation(() => []);
      mockReadFileSync.mockImplementation((filePath) => {
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
        return '';
      });

      const mockYamlData = createMockYamlData({
        category: 'BadCategory',
        provides: ['test_feature'],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        return '';
      });

      const result = await performRecipesValidate(options);

      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'warning' &&
            msg.text.includes(
              'Recipe category should use kebab-case (lowercase letters, numbers, and hyphens only)'
            )
        )
      ).toBe(true);
    });
  });

  describe('Apply Command Integration', () => {
    const setupApplyMocks = () => {};

    const setupStandardFileSystemMocks = () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) return true;
        if (path.includes('state.json')) return false;
        if (path.includes('.chorenzo/recipes')) return true;
        if (path.includes('test-recipe')) return true;
        if (path.includes('metadata.yaml')) return true;
        if (path.includes('prompt.md')) return true;
        if (path.includes('apply_recipe.md')) return true;
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
      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Execution completed successfully',
          total_cost_usd: 0.05,
        };
      });
    };

    const setupErrorQueryMock = () => {
      mockQuery.mockImplementation(async function* () {
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
            workspaceEcosystem: 'javascript',
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: 'javascript',
                type: 'web_app',
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
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        if (filePath.includes('apply_recipe.md'))
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        return '';
      });
    };

    beforeEach(() => {
      setupApplyMocks();
    });

    it('should apply recipe successfully', async () => {
      setupStandardApplyScenario();

      const result = await performRecipesApply({
        recipe: 'test-recipe',
        progress: false,
      });

      expect(result).toBeDefined();
      expect(result.summary.successfulProjects).toBe(1);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should verify progress events and thinking state during recipe application', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) return true;
        if (path.includes('state.json')) return false;
        if (path.includes('.chorenzo/recipes')) return true;
        if (path.includes('test-recipe')) return true;
        if (path.includes('metadata.yaml')) return true;
        if (path.includes('prompt.md')) return true;
        if (path.includes('apply_recipe.md')) return true;
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
            workspaceEcosystem: 'javascript',
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: 'javascript',
                type: 'web_app',
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
        return '';
      });

      mockQuery.mockImplementation(async function* () {
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
          progress: false,
        },
        mockProgress
      );

      expect(result).toBeDefined();
      expect(result.summary.successfulProjects).toBe(1);

      expect(mockProgress).toHaveBeenCalledWith('Loading recipe...');
      expect(mockProgress).toHaveBeenCalledWith(
        'Validating recipe structure...'
      );
      expect(mockProgress).toHaveBeenCalledWith('Ensuring analysis data...');
      expect(mockProgress).toHaveBeenCalledWith(
        'Checking recipe dependencies...'
      );
      expect(mockProgress).toHaveBeenCalledWith(
        'Filtering applicable projects...'
      );
      expect(mockProgress).toHaveBeenCalledWith(
        'Reading src/package.json',
        false
      );
      expect(mockProgress).toHaveBeenCalledWith('', true);
      expect(mockProgress).toHaveBeenCalledWith('', false);
      expect(mockProgress).toHaveBeenCalledWith('Writing .eslintrc.js', false);
    });

    it('should handle missing analysis by running analysis', async () => {
      setupStandardFileSystemMocks();
      setupSuccessfulQueryMock();

      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) return false;
        if (path.includes('state.json')) return false;
        if (path.includes('.chorenzo/recipes')) return true;
        if (path.includes('test-recipe')) return true;
        if (path.includes('metadata.yaml')) return true;
        if (path.includes('prompt.md')) return true;
        if (path.includes('apply_recipe.md')) return true;
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
        if (filePath.includes('state.json')) {
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        }
        return '';
      });

      mockPerformAnalysis.mockResolvedValue({
        analysis: {
          isMonorepo: false,
          hasWorkspacePackageManager: false,
          workspaceEcosystem: 'javascript',
          projects: [
            {
              path: '.',
              language: 'javascript',
              ecosystem: 'javascript',
              type: 'web_app',
              dependencies: [],
              hasPackageManager: true,
            },
          ],
        },
      });

      await performRecipesApply({
        recipe: 'test-recipe',
        progress: false,
      });

      expect(mockPerformAnalysis).toHaveBeenCalled();
    });

    it('should validate recipe dependencies', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) return true;
        if (path.includes('state.json')) return true;
        if (path.includes('.chorenzo/recipes')) return true;
        if (path.includes('test-recipe')) return true;
        if (path.includes('metadata.yaml')) return true;
        if (path.includes('prompt.md')) return true;
        if (path.includes('apply_recipe.md')) return true;
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
            workspaceEcosystem: 'javascript',
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: 'javascript',
                type: 'web_app',
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
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        if (filePath.includes('apply_recipe.md'))
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        if (filePath.includes('state.json'))
          return JSON.stringify({
            workspace: {
              'prerequisite.exists': false,
            },
            projects: {},
          });
        return '';
      });

      await expect(
        performRecipesApply({
          recipe: 'test-recipe',
          progress: false,
        })
      ).rejects.toThrow('unsatisfied dependencies');
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
            workspaceEcosystem: 'javascript',
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: 'javascript',
                type: 'web_app',
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
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        if (filePath.includes('apply_recipe.md'))
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        if (filePath.includes('state.json'))
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        return '';
      });

      const result = await performRecipesApply({
        recipe: 'test-recipe',
        progress: false,
      });

      expect(result.summary.failedProjects).toBe(1);
      expect(result.executionResults[0].success).toBe(false);
    });

    it('should apply recipe with custom variant', async () => {
      setupStandardFileSystemMocks();
      setupSuccessfulQueryMock();

      const mockYamlData = createMockYamlData({
        variants: [
          { id: 'basic', fix_prompt: 'Basic fix' },
          { id: 'advanced', fix_prompt: 'Advanced fix' },
        ],
        provides: ['test_feature.exists'],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('analysis.json')) {
          return JSON.stringify({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
            workspaceEcosystem: 'javascript',
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: 'javascript',
                type: 'web_app',
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
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        if (filePath.includes('apply_recipe.md'))
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        if (filePath.includes('state.json'))
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        return '';
      });

      const result = await performRecipesApply({
        recipe: 'test-recipe',
        variant: 'advanced',
        progress: false,
      });

      expect(result).toBeDefined();
      expect(result.summary.successfulProjects).toBe(1);
    });

    it('should apply recipe with project filtering', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) return true;
        if (path.includes('state.json')) return false;
        if (path.includes('.chorenzo/recipes')) return true;
        if (path.includes('test-recipe')) return true;
        if (path.includes('metadata.yaml')) return true;
        if (path.includes('prompt.md')) return true;
        if (path.includes('apply_recipe.md')) return true;
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
            isMonorepo: true,
            hasWorkspacePackageManager: true,
            workspaceEcosystem: 'javascript',
            projects: [
              {
                path: 'frontend',
                language: 'javascript',
                ecosystem: 'javascript',
                type: 'web_app',
                dependencies: [],
                hasPackageManager: true,
              },
              {
                path: 'backend',
                language: 'javascript',
                ecosystem: 'javascript',
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
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        if (filePath.includes('apply_recipe.md'))
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        if (filePath.includes('state.json'))
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        return '';
      });

      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Execution completed successfully',
          total_cost_usd: 0.05,
        };
      });

      const result = await performRecipesApply({
        recipe: 'test-recipe',
        project: 'frontend',
        progress: false,
      });

      expect(result).toBeDefined();
      expect(result.summary.totalProjects).toBe(1);
      expect(result.summary.successfulProjects).toBe(1);
    });

    it('should handle multiple projects with mixed success', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) return true;
        if (path.includes('state.json')) return false;
        if (path.includes('.chorenzo/recipes')) return true;
        if (path.includes('test-recipe')) return true;
        if (path.includes('metadata.yaml')) return true;
        if (path.includes('prompt.md')) return true;
        if (path.includes('apply_recipe.md')) return true;
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
            isMonorepo: true,
            hasWorkspacePackageManager: true,
            workspaceEcosystem: 'javascript',
            projects: [
              {
                path: 'project1',
                language: 'javascript',
                ecosystem: 'javascript',
                type: 'web_app',
                dependencies: [],
                hasPackageManager: true,
              },
              {
                path: 'project2',
                language: 'javascript',
                ecosystem: 'javascript',
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
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        if (filePath.includes('apply_recipe.md'))
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        if (filePath.includes('state.json'))
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        return '';
      });

      let queryCallCount = 0;
      mockQuery.mockImplementation(async function* () {
        queryCallCount++;
        if (queryCallCount === 1) {
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
        progress: false,
      });

      expect(result.summary.totalProjects).toBe(2);
      expect(result.summary.successfulProjects).toBe(1);
      expect(result.summary.failedProjects).toBe(1);
    });

    it('should handle dependency conflicts', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) return true;
        if (path.includes('state.json')) return true;
        if (path.includes('.chorenzo/recipes')) return true;
        if (path.includes('test-recipe')) return true;
        if (path.includes('metadata.yaml')) return true;
        if (path.includes('prompt.md')) return true;
        if (path.includes('apply_recipe.md')) return true;
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
            workspaceEcosystem: 'javascript',
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: 'javascript',
                type: 'web_app',
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
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        if (filePath.includes('apply_recipe.md'))
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
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
          progress: false,
        })
      ).rejects.toThrow('unsatisfied dependencies');
    });

    it('should handle recipe not found', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('.chorenzo/recipes')) return true;
        if (path.includes('other-recipe')) return true;
        if (path.includes('other-recipe/metadata.yaml')) return true;
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
          progress: false,
        })
      ).rejects.toThrow("Recipe 'nonexistent-recipe' not found");
    });

    it('should handle no applicable projects', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) return true;
        if (path.includes('state.json')) return false;
        if (path.includes('.chorenzo/recipes')) return true;
        if (path.includes('test-recipe')) return true;
        if (path.includes('metadata.yaml')) return true;
        if (path.includes('prompt.md')) return true;
        if (path.includes('apply_recipe.md')) return true;
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
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        if (filePath.includes('apply_recipe.md'))
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        if (filePath.includes('state.json'))
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        return '';
      });

      await expect(
        performRecipesApply({
          recipe: 'test-recipe',
          progress: false,
        })
      ).rejects.toThrow('No applicable projects found');
    });

    it('should handle corrupted analysis file', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) return true;
        if (path.includes('state.json')) return false;
        if (path.includes('.chorenzo/recipes')) return true;
        if (path.includes('test-recipe')) return true;
        if (path.includes('metadata.yaml')) return true;
        if (path.includes('prompt.md')) return true;
        if (path.includes('apply_recipe.md')) return true;
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
          throw new Error('Invalid JSON syntax');
        }
        if (filePath.includes('config.yaml')) {
          return yamlStringify(mockYamlData.config);
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        if (filePath.includes('apply_recipe.md'))
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        if (filePath.includes('state.json'))
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        return '';
      });

      mockPerformAnalysis.mockResolvedValue({
        analysis: {
          isMonorepo: false,
          hasWorkspacePackageManager: false,
          workspaceEcosystem: 'javascript',
          projects: [
            {
              path: '.',
              language: 'javascript',
              ecosystem: 'javascript',
              type: 'web_app',
              dependencies: [],
              hasPackageManager: true,
            },
          ],
        },
      });

      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Execution completed successfully',
          total_cost_usd: 0.05,
        };
      });

      const result = await performRecipesApply({
        recipe: 'test-recipe',
        progress: false,
      });

      expect(mockPerformAnalysis).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should handle analysis generation failure', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) return false;
        if (path.includes('state.json')) return false;
        if (path.includes('.chorenzo/recipes')) return true;
        if (path.includes('test-recipe')) return true;
        if (path.includes('metadata.yaml')) return true;
        if (path.includes('prompt.md')) return true;
        if (path.includes('apply_recipe.md')) return true;
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
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        if (filePath.includes('apply_recipe.md'))
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        if (filePath.includes('state.json'))
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
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
          progress: false,
        })
      ).rejects.toThrow('Analysis failed');
    });

    it('should handle recipe application failure', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) return true;
        if (path.includes('state.json')) return false;
        if (path.includes('.chorenzo/recipes')) return true;
        if (path.includes('test-recipe')) return true;
        if (path.includes('metadata.yaml')) return true;
        if (path.includes('prompt.md')) return true;
        if (path.includes('apply_recipe.md')) return true;
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
            workspaceEcosystem: 'javascript',
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: 'javascript',
                type: 'web_app',
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
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        if (filePath.includes('apply_recipe.md'))
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        if (filePath.includes('state.json'))
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        return '';
      });

      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'error',
        };
      });

      const result = await performRecipesApply({
        recipe: 'test-recipe',
        progress: false,
      });

      expect(result.summary.totalProjects).toBe(1);
      expect(result.summary.successfulProjects).toBe(0);
      expect(result.summary.failedProjects).toBe(1);
      expect(result.executionResults[0].success).toBe(false);
      expect(result.executionResults[0].error).toContain(
        'Unknown error occurred'
      );
    });

    it('should handle variant not found', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) return true;
        if (path.includes('state.json')) return false;
        if (path.includes('.chorenzo/recipes')) return true;
        if (path.includes('test-recipe')) return true;
        if (path.includes('metadata.yaml')) return true;
        if (path.includes('prompt.md')) return true;
        if (path.includes('apply_recipe.md')) return true;
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
            workspaceEcosystem: 'javascript',
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: 'javascript',
                type: 'web_app',
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
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        if (filePath.includes('apply_recipe.md'))
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        if (filePath.includes('state.json'))
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        return '';
      });

      const result = await performRecipesApply({
        recipe: 'test-recipe',
        variant: 'nonexistent',
        progress: false,
      });

      expect(result.summary.totalProjects).toBe(1);
      expect(result.summary.successfulProjects).toBe(0);
      expect(result.summary.failedProjects).toBe(1);
      expect(result.executionResults[0].success).toBe(false);
      expect(result.executionResults[0].error).toContain(
        'not found for ecosystem'
      );
    });

    it('should handle state file read errors gracefully', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) return true;
        if (path.includes('state.json')) return true;
        if (path.includes('.chorenzo/recipes')) return true;
        if (path.includes('test-recipe')) return true;
        if (path.includes('metadata.yaml')) return true;
        if (path.includes('prompt.md')) return true;
        if (path.includes('apply_recipe.md')) return true;
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
            workspaceEcosystem: 'javascript',
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: 'javascript',
                type: 'web_app',
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
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        if (filePath.includes('apply_recipe.md'))
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        if (filePath.includes('state.json')) {
          throw new Error('Permission denied');
        }
        return '';
      });

      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Execution completed successfully',
          total_cost_usd: 0.05,
        };
      });

      const result = await performRecipesApply({
        recipe: 'test-recipe',
        progress: false,
      });

      expect(result).toBeDefined();
      expect(result.summary.totalProjects).toBe(1);
    });

    it('should handle empty recipe application result', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) return true;
        if (path.includes('state.json')) return false;
        if (path.includes('.chorenzo/recipes')) return true;
        if (path.includes('test-recipe')) return true;
        if (path.includes('metadata.yaml')) return true;
        if (path.includes('prompt.md')) return true;
        if (path.includes('apply_recipe.md')) return true;
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
            workspaceEcosystem: 'javascript',
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: 'javascript',
                type: 'web_app',
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
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        if (filePath.includes('apply_recipe.md'))
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        if (filePath.includes('state.json'))
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        return '';
      });

      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          result: '',
        };
      });

      const result = await performRecipesApply({
        recipe: 'test-recipe',
        progress: false,
      });

      expect(result.summary.totalProjects).toBe(1);
      expect(result.summary.successfulProjects).toBe(1);
      expect(result.summary.failedProjects).toBe(0);
      expect(result.executionResults[0].success).toBe(true);
    });

    it('should verify chorenzo context initialization progress', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) return true;
        if (path.includes('state.json')) return false;
        if (path.includes('.chorenzo/recipes')) return true;
        if (path.includes('test-recipe')) return true;
        if (path.includes('metadata.yaml')) return true;
        if (path.includes('prompt.md')) return true;
        if (path.includes('apply_recipe.md')) return true;
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
            workspaceEcosystem: 'javascript',
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: 'javascript',
                type: 'web_app',
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
        if (filePath.includes('state.json'))
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        return '';
      });

      mockQuery.mockImplementation(async function* () {
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
          progress: false,
        },
        mockProgress
      );

      expect(result).toBeDefined();
      expect(result.summary.successfulProjects).toBe(1);

      expect(mockProgress).toHaveBeenCalledWith('Loading recipe...');
      expect(mockProgress).toHaveBeenCalledWith(
        'Validating recipe structure...'
      );
      expect(mockProgress).toHaveBeenCalledWith('Ensuring analysis data...');
      expect(mockProgress).toHaveBeenCalledWith(
        'Checking recipe dependencies...'
      );
      expect(mockProgress).toHaveBeenCalledWith(
        'Filtering applicable projects...'
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
        progress: false,
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

      mockQuery.mockImplementation(async function* () {
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
        progress: false,
      });

      expect(result).toBeDefined();
      expect(result.summary.successfulProjects).toBe(1);
    });

    it('should apply workspace-level recipe successfully', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) return true;
        if (path.includes('state.json')) return false;
        if (path.includes('.chorenzo/recipes')) return true;
        if (path.includes('workspace-recipe')) return true;
        if (path.includes('metadata.yaml')) return true;
        if (path.includes('prompt.md')) return true;
        if (path.includes('apply_recipe.md')) return true;
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
      ] = {
        repo: 'https://github.com/test/workspace-recipe.git',
        ref: 'main',
      };

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('analysis.json')) {
          return JSON.stringify({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
            workspaceEcosystem: 'javascript',
            projects: [
              {
                path: '.',
                language: 'javascript',
                ecosystem: 'javascript',
                type: 'web_app',
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
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        if (filePath.includes('apply_recipe.md'))
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        return '';
      });

      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Execution completed successfully',
          total_cost_usd: 0.05,
        };
      });

      const result = await performRecipesApply({
        recipe: 'workspace-recipe',
        progress: false,
      });

      expect(result).toBeDefined();
      expect(result.summary.successfulProjects).toBe(1);
      expect(result.summary.totalProjects).toBe(1);
      expect(result.executionResults[0].projectPath).toBe('workspace');
    });

    it('should handle workspace recipe with unsupported ecosystem', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) return true;
        if (path.includes('state.json')) return false;
        if (path.includes('.chorenzo/recipes')) return true;
        if (path.includes('workspace-recipe')) return true;
        if (path.includes('metadata.yaml')) return true;
        if (path.includes('prompt.md')) return true;
        if (path.includes('apply_recipe.md')) return true;
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
      ] = {
        repo: 'https://github.com/test/workspace-recipe.git',
        ref: 'main',
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
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        if (filePath.includes('apply_recipe.md'))
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        return '';
      });

      await expect(
        performRecipesApply({
          recipe: 'workspace-recipe',
          progress: false,
        })
      ).rejects.toThrow('does not support workspace ecosystem');
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
          if (path.includes('analysis.json')) return true;
          if (path.includes('state.json')) return false;
          if (path.includes('.chorenzo/recipes')) return true;
          if (path.includes(recipeId)) return true;
          if (path.includes('metadata.yaml')) return true;
          if (path.includes('prompt.md')) return true;
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
          if (filePath.includes('prompt.md'))
            return '## Goal\nAdd formatter\n\n## Investigation\nCheck formatter\n\n## Expected Output\nFormatter configured';
          if (
            filePath.includes(
              'apply_recipe_workspace_application_instructions.md'
            )
          )
            return 'Apply {{ recipe_id }} at workspace level...';
          if (
            filePath.includes(
              'apply_recipe_project_application_instructions.md'
            )
          )
            return 'Apply {{ recipe_id }} to {{ project_path }}...';
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
        ] = {
          repo: 'https://github.com/test/workspace-preferred-recipe.git',
          ref: 'main',
        };

        const analysisData = {
          isMonorepo: false,
          hasWorkspacePackageManager: true,
          workspaceEcosystem: 'javascript',
          projects: [
            {
              path: '/workspace/app',
              language: 'javascript',
              ecosystem: 'javascript',
              type: 'application',
              dependencies: [],
              hasPackageManager: true,
            },
          ],
        };

        setupHierarchicalLevelReadFileSync(mockYamlData, analysisData);

        const result = await performRecipesApply({
          recipe: 'workspace-preferred-recipe',
          progress: false,
        });

        expect(result.executionResults).toHaveLength(1);
        expect(result.executionResults[0].success).toBe(true);
        expect(result.executionResults[0].projectPath).toBe('workspace');
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
        ] = {
          repo: 'https://github.com/test/workspace-preferred-recipe.git',
          ref: 'main',
        };

        mockYamlData.metadata.ecosystems = [
          {
            id: 'python',
            default_variant: 'black',
            variants: [{ id: 'black', fix_prompt: 'fixes/black.md' }],
          },
        ];

        const analysisData = {
          isMonorepo: true,
          hasWorkspacePackageManager: true,
          workspaceEcosystem: 'javascript',
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
          progress: false,
        });

        expect(result.executionResults).toHaveLength(1);
        expect(result.executionResults[0].success).toBe(true);
        expect(result.executionResults[0].projectPath).toContain(
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
        ] = {
          repo: 'https://github.com/test/multi-ecosystem-recipe.git',
          ref: 'main',
        };

        mockYamlData.metadata.ecosystems = [
          {
            id: 'javascript',
            default_variant: 'prettier',
            variants: [{ id: 'prettier', fix_prompt: 'fixes/prettier.md' }],
          },
          {
            id: 'python',
            default_variant: 'black',
            variants: [{ id: 'black', fix_prompt: 'fixes/black.md' }],
          },
        ];

        const analysisData = {
          isMonorepo: true,
          hasWorkspacePackageManager: true,
          workspaceEcosystem: 'javascript',
          projects: [
            {
              path: '/workspace/frontend',
              language: 'javascript',
              ecosystem: 'javascript',
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
          progress: false,
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
        ] = {
          repo: 'https://github.com/test/unsupported-recipe.git',
          ref: 'main',
        };

        mockYamlData.metadata.ecosystems = [
          {
            id: 'go',
            default_variant: 'gofmt',
            variants: [{ id: 'gofmt', fix_prompt: 'fixes/gofmt.md' }],
          },
        ];

        const analysisData = {
          isMonorepo: false,
          hasWorkspacePackageManager: true,
          workspaceEcosystem: 'javascript',
          projects: [
            {
              path: '/workspace/app',
              language: 'javascript',
              ecosystem: 'javascript',
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
            progress: false,
          })
        ).rejects.toThrow('could not be applied at workspace or project level');
      });

      it('should handle project-only recipe correctly', async () => {
        setupStandardApplyScenario();
        setupHierarchicalLevelMocks('project-only-recipe');

        const mockYamlData = createMockYamlData({
          recipeId: 'project-only-recipe',
          level: 'project-only' as const,
          provides: ['project.feature'],
        });
        (mockYamlData.config.libraries as Record<string, unknown>)[
          'project-only-recipe'
        ] = {
          repo: 'https://github.com/test/project-only-recipe.git',
          ref: 'main',
        };

        mockReadFileSync.mockImplementation((filePath: string) => {
          if (filePath.includes('analysis.json')) {
            return JSON.stringify({
              isMonorepo: false,
              hasWorkspacePackageManager: true,
              workspaceEcosystem: 'javascript',
              projects: [
                {
                  path: '/workspace/app',
                  language: 'javascript',
                  ecosystem: 'javascript',
                  type: 'application',
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
          if (filePath.includes('prompt.md'))
            return '## Goal\nAdd project feature\n\n## Investigation\nCheck project\n\n## Expected Output\nProject configured';
          if (
            filePath.includes(
              'apply_recipe_project_application_instructions.md'
            )
          )
            return 'Apply {{ recipe_id }} to {{ project_path }}...';
          return '';
        });

        const result = await performRecipesApply({
          recipe: 'project-only-recipe',
          progress: false,
        });

        expect(result.executionResults).toHaveLength(1);
        expect(result.executionResults[0].success).toBe(true);
        expect(result.executionResults[0].projectPath).toContain('app');
      });

      it('should handle workspace-only recipe correctly', async () => {
        setupStandardApplyScenario();
        setupHierarchicalLevelMocks('workspace-only-recipe');

        const mockYamlData = createMockYamlData({
          recipeId: 'workspace-only-recipe',
          level: 'workspace-only' as const,
          provides: ['workspace.feature'],
        });
        (mockYamlData.config.libraries as Record<string, unknown>)[
          'workspace-only-recipe'
        ] = {
          repo: 'https://github.com/test/workspace-only-recipe.git',
          ref: 'main',
        };

        mockReadFileSync.mockImplementation((filePath: string) => {
          if (filePath.includes('analysis.json')) {
            return JSON.stringify({
              isMonorepo: false,
              hasWorkspacePackageManager: true,
              workspaceEcosystem: 'javascript',
              projects: [
                {
                  path: '/workspace/app',
                  language: 'javascript',
                  ecosystem: 'javascript',
                  type: 'application',
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
          if (filePath.includes('prompt.md'))
            return '## Goal\nAdd workspace feature\n\n## Investigation\nCheck workspace\n\n## Expected Output\nWorkspace configured';
          if (
            filePath.includes(
              'apply_recipe_workspace_application_instructions.md'
            )
          )
            return 'Apply {{ recipe_id }} at workspace level...';
          return '';
        });

        const result = await performRecipesApply({
          recipe: 'workspace-only-recipe',
          progress: false,
        });

        expect(result.executionResults).toHaveLength(1);
        expect(result.executionResults[0].success).toBe(true);
        expect(result.executionResults[0].projectPath).toBe('workspace');
      });
    });
  });
});
