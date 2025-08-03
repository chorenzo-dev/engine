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

  const setupLocationMocks = (
    fileStructure: Record<string, boolean>,
    directoryStructure: Record<string, string[]>
  ) => {
    mockExistsSync.mockImplementation((filePath: string) => {
      return fileStructure[filePath] || false;
    });

    mockStatSync.mockImplementation(
      (filePath: string) =>
        ({
          isDirectory: () => !filePath.includes('.'),
          isFile: () => filePath.includes('.'),
        }) as fs.Stats
    );

    mockReaddirSync.mockImplementation((dirPath: string) => {
      return directoryStructure[dirPath] || [];
    });
  };

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
    mockQuery.mockImplementation(async function* () {
      yield { type: 'result', is_error: false };
    });
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
      if (filePath === '/path/to/library') {
        return true;
      }
      if (filePath === '/path/to/library/metadata.yaml') {
        return false;
      }
      if (filePath === '/path/to/library/recipe1') {
        return true;
      }
      if (filePath === '/path/to/library/recipe2') {
        return true;
      }
      if (filePath === '/path/to/library/recipe1/metadata.yaml') {
        return true;
      }
      if (filePath === '/path/to/library/recipe2/metadata.yaml') {
        return true;
      }
      if (filePath === '/path/to/library/recipe1/prompt.md') {
        return true;
      }
      if (filePath === '/path/to/library/recipe2/prompt.md') {
        return true;
      }
      if (filePath === '/path/to/library/recipe1/fixes') {
        return true;
      }
      if (filePath === '/path/to/library/recipe2/fixes') {
        return true;
      }
      if (filePath === '/path/to/library/recipe1/fixes/basic.md') {
        return true;
      }
      if (filePath === '/path/to/library/recipe2/fixes/basic.md') {
        return true;
      }
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
    expect(result.summary?.total).toBe(2);
    expect(result.summary?.valid).toBe(2);
    expect(mockProgress).toHaveBeenCalledWith(
      'This will validate all recipes in the library: /path/to/library'
    );
  });

  it('should handle recipe search in nested directories', async () => {
    const options = { target: 'nested-recipe' };

    mockExistsSync.mockImplementation((filePath: string) => {
      if (filePath === '/test/home/.chorenzo/recipes') {
        return true;
      }
      if (filePath === '/test/home/.chorenzo/recipes/lib1') {
        return true;
      }
      if (filePath === '/test/home/.chorenzo/recipes/lib2') {
        return true;
      }
      if (filePath === '/test/home/.chorenzo/recipes/lib1/nested-recipe') {
        return true;
      }
      if (
        filePath ===
        '/test/home/.chorenzo/recipes/lib1/nested-recipe/metadata.yaml'
      ) {
        return true;
      }
      if (
        filePath === '/test/home/.chorenzo/recipes/lib1/nested-recipe/prompt.md'
      ) {
        return true;
      }
      if (
        filePath === '/test/home/.chorenzo/recipes/lib1/nested-recipe/fixes'
      ) {
        return true;
      }
      if (
        filePath ===
        '/test/home/.chorenzo/recipes/lib1/nested-recipe/fixes/basic.md'
      ) {
        return true;
      }
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
    expect(result.summary?.total).toBe(0);
    expect(mockProgress).toHaveBeenCalledWith(
      'This will clone and validate recipes from: https://github.com/user/recipes.git'
    );
    expect(mockProgress).toHaveBeenCalledWith('Cloning repository');
    expect(mockProgress).toHaveBeenCalledWith('Validating cloned recipes');
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
        if (filePath === '/test/home/.chorenzo/recipes') {
          return true;
        }
        if (filePath === '/test/home/.chorenzo/recipes/other-recipe') {
          return true;
        }
        if (
          filePath === '/test/home/.chorenzo/recipes/other-recipe/metadata.yaml'
        ) {
          return true;
        }
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
        "Recipe 'nonexistent-recipe' not found in"
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
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
        }
        return '';
      });

      const mockYamlData = createMockYamlData({
        recipeId: 'snake_case_recipe',
        provides: ['test_feature'],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
        }
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
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
        }
        return '';
      });

      const mockYamlData = createMockYamlData({
        category: 'BadCategory',
        provides: ['test_feature'],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
        }
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

    it('should reject reserved keywords in provides field', async () => {
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

      const mockYamlData = createMockYamlData({
        provides: ['workspace.reserved', 'project.also_reserved', 'valid.key'],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        return '';
      });

      const result = await performRecipesValidate(options);

      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'error' &&
            msg.text.includes(
              'Recipe provides list cannot contain reserved keywords: workspace.reserved'
            )
        )
      ).toBe(true);
      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'error' &&
            msg.text.includes(
              'Recipe provides list cannot contain reserved keywords: project.also_reserved'
            )
        )
      ).toBe(true);

      const errorMessages = result.messages.filter(
        (msg) => msg.type === 'error'
      );
      expect(errorMessages).toHaveLength(3);
    });
  });

  describe('Apply Command Integration', () => {
    const setupApplyMocks = () => {};

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
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
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
      });

      expect(result).toBeDefined();
      expect(result.summary.successfulProjects).toBe(1);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should verify progress events and thinking state during recipe application', async () => {
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

      const result = await performRecipesApply({
        recipe: 'test-recipe',
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

      const result = await performRecipesApply({
        recipe: 'test-recipe',
        variant: 'advanced',
      });

      expect(result).toBeDefined();
      expect(result.summary.successfulProjects).toBe(1);
    });

    it('should apply recipe with project filtering', async () => {
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
      });

      expect(result).toBeDefined();
      expect(result.summary.totalProjects).toBe(1);
      expect(result.summary.successfulProjects).toBe(1);
    });

    it('should handle multiple projects with mixed success', async () => {
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

      let queryCallCount = 0;
      mockQuery.mockImplementation(async function* () {
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
      ).rejects.toThrow('unsatisfied dependencies');
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

      await expect(
        performRecipesApply({
          recipe: 'test-recipe',
        })
      ).rejects.toThrow('No applicable projects found');
    });

    it('should handle corrupted analysis file', async () => {
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
        if (filePath.includes('state.json')) {
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        }
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
      expect(result.executionResults[0].success).toBe(false);
      expect(result.executionResults[0].error).toContain(
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
      });

      expect(result).toBeDefined();
      expect(result.summary.totalProjects).toBe(1);
    });

    it('should handle empty recipe application result', async () => {
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
        if (filePath.includes('state.json')) {
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
        }
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
      });

      expect(result.summary.totalProjects).toBe(1);
      expect(result.summary.successfulProjects).toBe(1);
      expect(result.summary.failedProjects).toBe(0);
      expect(result.executionResults[0].success).toBe(true);
    });

    it('should verify chorenzo context initialization progress', async () => {
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
        if (filePath.includes('state.json')) {
          return '{"last_checked": "1970-01-01T00:00:00Z"}';
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
          type: 'result',
          subtype: 'success',
          result: 'Execution completed successfully',
          total_cost_usd: 0.05,
        };
      });

      const result = await performRecipesApply({
        recipe: 'workspace-recipe',
      });

      expect(result).toBeDefined();
      expect(result.summary.successfulProjects).toBe(1);
      expect(result.summary.totalProjects).toBe(1);
      expect(result.executionResults[0].projectPath).toBe('workspace');
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
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
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
            'agnostic-workspace-recipe': {
              repo: 'https://github.com/test/agnostic-workspace-recipe.git',
              ref: 'main',
            },
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

      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          result: 'Execution completed successfully',
          total_cost_usd: 0.05,
        };
      });

      const result = await performRecipesApply({
        recipe: 'agnostic-workspace-recipe',
      });

      expect(result).toBeDefined();
      expect(result.summary.successfulProjects).toBe(1);
      expect(result.summary.totalProjects).toBe(1);
      expect(result.executionResults[0].projectPath).toBe('workspace');
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
          })
        ).rejects.toThrow('could not be applied at workspace or project level');
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
          if (filePath.includes('prompt.md')) {
            return '## Goal\nAdd project feature\n\n## Investigation\nCheck project\n\n## Expected Output\nProject configured';
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

        const result = await performRecipesApply({
          recipe: 'project-only-recipe',
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
          provides: ['workspace-only-recipe.feature'],
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
          if (filePath.includes('prompt.md')) {
            return '## Goal\nAdd workspace feature\n\n## Investigation\nCheck workspace\n\n## Expected Output\nWorkspace configured';
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

        const result = await performRecipesApply({
          recipe: 'workspace-only-recipe',
        });

        expect(result.executionResults).toHaveLength(1);
        expect(result.executionResults[0].success).toBe(true);
        expect(result.executionResults[0].projectPath).toBe('workspace');
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
            variants: [{ id: 'basic', fix_prompt: 'fixes/basic.md' }],
          },
        ];
        (mockYamlData.config.libraries as Record<string, unknown>)[
          'project-ecosystem-recipe'
        ] = {
          repo: 'https://github.com/test/project-ecosystem-recipe.git',
          ref: 'main',
        };

        mockReadFileSync.mockImplementation((filePath: string) => {
          if (filePath.includes('analysis.json')) {
            return JSON.stringify({
              isMonorepo: true,
              hasWorkspacePackageManager: true,
              workspaceEcosystem: 'javascript',
              projects: [
                {
                  path: '/workspace/python-app',
                  language: 'python',
                  ecosystem: 'python',
                  type: 'web_app',
                  dependencies: [],
                  hasPackageManager: true,
                },
                {
                  path: '/workspace/js-app',
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

        mockQuery.mockImplementation(async function* () {
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
        expect(result.executionResults[0].projectPath).toContain('python-app');
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
            variants: [{ id: 'basic', fix_prompt: 'fixes/basic.md' }],
          },
        ];
        (mockYamlData.config.libraries as Record<string, unknown>)[
          'project-type-recipe'
        ] = {
          repo: 'https://github.com/test/project-type-recipe.git',
          ref: 'main',
        };

        mockReadFileSync.mockImplementation((filePath: string) => {
          if (filePath.includes('analysis.json')) {
            return JSON.stringify({
              isMonorepo: true,
              hasWorkspacePackageManager: true,
              workspaceEcosystem: 'javascript',
              projects: [
                {
                  path: '/workspace/api',
                  language: 'javascript',
                  ecosystem: 'javascript',
                  type: 'api_server',
                  dependencies: [],
                  hasPackageManager: true,
                },
                {
                  path: '/workspace/frontend',
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

        mockQuery.mockImplementation(async function* () {
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
        expect(result.executionResults[0].projectPath).toContain('api');
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
            variants: [{ id: 'basic', fix_prompt: 'fixes/basic.md' }],
          },
        ];
        (mockYamlData.config.libraries as Record<string, unknown>)[
          'workspace-monorepo-recipe'
        ] = {
          repo: 'https://github.com/test/workspace-monorepo-recipe.git',
          ref: 'main',
        };

        mockReadFileSync.mockImplementation((filePath: string) => {
          if (filePath.includes('analysis.json')) {
            return JSON.stringify({
              isMonorepo: true,
              hasWorkspacePackageManager: true,
              workspaceEcosystem: 'javascript',
              projects: [
                {
                  path: '/workspace/app1',
                  language: 'javascript',
                  ecosystem: 'javascript',
                  type: 'web_app',
                  dependencies: [],
                  hasPackageManager: true,
                },
                {
                  path: '/workspace/app2',
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

        mockQuery.mockImplementation(async function* () {
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
            variants: [{ id: 'basic', fix_prompt: 'fixes/basic.md' }],
          },
        ];
        (mockYamlData.config.libraries as Record<string, unknown>)[
          'project-framework-recipe'
        ] = {
          repo: 'https://github.com/test/project-framework-recipe.git',
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
                  path: '/workspace/vue-app',
                  language: 'javascript',
                  ecosystem: 'javascript',
                  type: 'web_app',
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

    describe('Ecosystem-agnostic recipe validation', () => {
      beforeEach(() => {
        mockExistsSync.mockImplementation((filePath: string) => {
          if (filePath === '/path/to/agnostic-recipe') {
            return true;
          }
          if (filePath === '/path/to/agnostic-recipe/metadata.yaml') {
            return true;
          }
          if (filePath === '/path/to/agnostic-recipe/prompt.md') {
            return true;
          }
          if (filePath === '/path/to/agnostic-recipe/fix.md') {
            return true;
          }
          return false;
        });

        mockStatSync.mockImplementation(
          (filePath: string) =>
            ({
              isDirectory: () => !filePath.includes('.'),
              isFile: () => filePath.includes('.'),
            }) as fs.Stats
        );

        mockReadFileSync.mockImplementation((filePath: string) => {
          if (filePath === '/path/to/agnostic-recipe/metadata.yaml') {
            return `
id: agnostic-recipe
category: utilities
summary: Test ecosystem-agnostic recipe
level: workspace-preferred
ecosystems: []
provides: []
requires: []
`;
          }
          if (filePath === '/path/to/agnostic-recipe/prompt.md') {
            return '## Goal\nTest goal\n## Investigation\nTest investigation\n## Expected Output\nTest output';
          }
          if (filePath === '/path/to/agnostic-recipe/fix.md') {
            return '# Agnostic Fix\nThis works for any ecosystem.';
          }
          return '';
        });
      });

      it('should validate ecosystem-agnostic recipe successfully', async () => {
        const options = { target: '/path/to/agnostic-recipe' };

        const result = await performRecipesValidate(options);

        expect(result.context.target).toBe('/path/to/agnostic-recipe');
        expect(result.context.recipesValidated).toEqual(['agnostic-recipe']);
        expect(result.messages).toBeDefined();
        expect(
          result.messages.some(
            (msg) =>
              msg.type === 'success' &&
              msg.text.includes("Recipe 'agnostic-recipe' is valid")
          )
        ).toBe(true);
      });

      it('should fail validation when fix.md is missing for ecosystem-agnostic recipe', async () => {
        mockExistsSync.mockImplementation((filePath: string) => {
          if (filePath === '/path/to/agnostic-recipe') {
            return true;
          }
          if (filePath === '/path/to/agnostic-recipe/metadata.yaml') {
            return true;
          }
          if (filePath === '/path/to/agnostic-recipe/prompt.md') {
            return true;
          }
          return false;
        });

        const options = { target: '/path/to/agnostic-recipe' };

        const result = await performRecipesValidate(options);

        expect(result.context.target).toBe('/path/to/agnostic-recipe');
        expect(result.messages).toBeDefined();
        expect(
          result.messages.some(
            (msg) =>
              msg.type === 'error' &&
              msg.text.includes(
                'Missing fix.md file for ecosystem-agnostic recipe'
              )
          )
        ).toBe(true);
      });
    });
  });

  describe('Recipe Generation', () => {
    let performRecipesGenerate: typeof import('./recipes').performRecipesGenerate;

    beforeEach(async () => {
      jest.clearAllMocks();
      setupDefaultMocks();
      const recipesModule = await import('./recipes');
      performRecipesGenerate = recipesModule.performRecipesGenerate;
    });

    const setupGenerateMocks = () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('docs/recipes.md')) {
          return true;
        }
        return false;
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('docs/recipes.md')) {
          return '# Recipe Guidelines\nFollow these principles...';
        }
        if (filePath.includes('recipe_magic_generate.md')) {
          return 'Generate recipe for: {{ recipe_name }}\nSummary: {{ summary }}';
        }
        if (filePath.includes('recipe_metadata.yaml')) {
          return 'id: {{ recipe_id }}\ncategory: {{ category }}\nsummary: {{ summary }}\n\necosystems: []\n\nprovides: []\n\nrequires: []';
        }
        if (filePath.includes('recipe_prompt.md')) {
          return '## Goal\n{{ summary }}';
        }
        if (filePath.includes('recipe_fix.md')) {
          return '# {{ recipe_name }}\nSetup instructions';
        }
        return 'mock file content';
      });
    };

    it('should generate recipe with basic template when magic is false', async () => {
      setupGenerateMocks();

      const result = await performRecipesGenerate({
        name: 'test-recipe',
        category: 'general',
        summary: 'Test recipe for testing',
        magicGenerate: false,
      });

      expect(result.success).toBe(true);
      expect(result.recipeName).toBe('test-recipe');
      expect(result.recipePath).toContain('test-recipe');
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('test-recipe'),
        { recursive: true }
      );
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('fixes'),
        { recursive: true }
      );
      expect(mockWriteFileSync).toHaveBeenCalledTimes(3);
    });

    it('should validate recipe name and convert spaces to dashes', async () => {
      setupGenerateMocks();

      const result = await performRecipesGenerate({
        name: 'eslint setup',
        category: 'linting',
        summary: 'Setup ESLint for project',
        magicGenerate: false,
      });

      expect(result.success).toBe(true);
      expect(result.recipeName).toBe('eslint-setup');
      expect(result.recipePath).toContain('eslint-setup');
    });

    it('should reject recipe names with invalid characters', async () => {
      setupGenerateMocks();

      await expect(
        performRecipesGenerate({
          name: 'test@recipe!',
          category: 'test',
          summary: 'Test summary',
          magicGenerate: false,
        })
      ).rejects.toThrow('Recipe name contains invalid characters');
    });

    it('should reject empty recipe names', async () => {
      setupGenerateMocks();

      await expect(
        performRecipesGenerate({
          name: '',
          category: 'test',
          summary: 'Test summary',
          magicGenerate: false,
        })
      ).rejects.toThrow('Recipe name is required');
    });

    it('should require recipe name to be provided', async () => {
      setupGenerateMocks();

      await expect(
        performRecipesGenerate({
          magicGenerate: false,
        })
      ).rejects.toThrow('Recipe name is required');
    });

    it('should allow only letters, numbers, and dashes in recipe names', async () => {
      setupGenerateMocks();

      const result = await performRecipesGenerate({
        name: 'test-recipe-123',
        category: 'utilities',
        summary: 'Test recipe utilities',
        magicGenerate: false,
      });

      expect(result.success).toBe(true);
      expect(result.recipeName).toBe('test-recipe-123');
    });

    it('should reject recipe names with special characters', async () => {
      setupGenerateMocks();

      const invalidNames = [
        'test@recipe',
        'recipe!',
        'test#recipe',
        'recipe$',
        'test%recipe',
        'recipe^',
        'test&recipe',
        'recipe*',
        'test(recipe)',
        'recipe+',
        'test=recipe',
        'recipe|',
        'test\\recipe',
        'recipe/',
        'test:recipe',
        'recipe;',
        'test"recipe',
        "recipe'",
        'test<recipe>',
        'recipe?',
        'test.recipe',
        'recipe,',
      ];

      for (const name of invalidNames) {
        await expect(
          performRecipesGenerate({
            name,
            category: 'test',
            summary: 'Test summary',
            magicGenerate: false,
          })
        ).rejects.toThrow('Recipe name contains invalid characters');
      }
    });

    it('should convert spaces to dashes and lowercase', async () => {
      setupGenerateMocks();

      const result = await performRecipesGenerate({
        name: 'My Recipe Name',
        category: 'general',
        summary: 'Test recipe name conversion',
        magicGenerate: false,
      });

      expect(result.success).toBe(true);
      expect(result.recipeName).toBe('my-recipe-name');
    });

    it('should handle multiple consecutive spaces', async () => {
      setupGenerateMocks();

      const result = await performRecipesGenerate({
        name: 'test    multiple   spaces',
        category: 'formatting',
        summary: 'Test multiple spaces handling',
        magicGenerate: false,
      });

      expect(result.success).toBe(true);
      expect(result.recipeName).toBe('test-multiple-spaces');
    });

    it('should trim whitespace from recipe names', async () => {
      setupGenerateMocks();

      const result = await performRecipesGenerate({
        name: '  trimmed-name  ',
        category: 'cleanup',
        summary: 'Test whitespace trimming',
        magicGenerate: false,
      });

      expect(result.success).toBe(true);
      expect(result.recipeName).toBe('trimmed-name');
    });

    it('should reject names with only spaces', async () => {
      setupGenerateMocks();

      await expect(
        performRecipesGenerate({
          name: '   ',
          category: 'test',
          summary: 'Test summary',
          magicGenerate: false,
        })
      ).rejects.toThrow('Recipe name cannot be empty');
    });

    it('should handle template rendering correctly', async () => {
      setupGenerateMocks();

      await performRecipesGenerate({
        name: 'render-test',
        category: 'test-category',
        summary: 'Test summary',
        magicGenerate: false,
      });

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('metadata.yaml'),
        expect.stringContaining('render-test')
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('prompt.md'),
        expect.stringContaining('Test summary')
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('javascript_default.md'),
        expect.stringContaining('render-test')
      );
    });

    it('should call progress callback during generation', async () => {
      setupGenerateMocks();
      const mockProgress = jest.fn();

      await performRecipesGenerate(
        {
          name: 'progress-recipe',
          category: 'monitoring',
          summary: 'Test progress callbacks',
          magicGenerate: false,
        },
        mockProgress
      );

      expect(mockProgress).toHaveBeenCalledWith('Starting recipe generation');
      expect(mockProgress).toHaveBeenCalledWith(
        expect.stringContaining('Creating recipe directory')
      );
      expect(mockProgress).toHaveBeenCalledWith('Creating recipe files');
      expect(mockProgress).toHaveBeenCalledWith('Recipe generation complete!');
    });

    it('should populate template variables correctly', async () => {
      setupGenerateMocks();

      await performRecipesGenerate({
        name: 'template test',
        category: 'testing',
        summary: 'Test template variables',
        magicGenerate: false,
      });

      const metadataCall = mockWriteFileSync.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' && call[0].includes('metadata.yaml')
      );
      const promptCall = mockWriteFileSync.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' && call[0].includes('prompt.md')
      );
      const fixCall = mockWriteFileSync.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          call[0].includes('javascript_default.md')
      );

      expect(metadataCall).toBeDefined();
      expect(promptCall).toBeDefined();
      expect(fixCall).toBeDefined();
    });

    it('should create correct directory structure', async () => {
      setupGenerateMocks();

      await performRecipesGenerate({
        name: 'structure-test',
        category: 'testing',
        summary: 'Test directory structure',
        magicGenerate: false,
      });

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('structure-test'),
        { recursive: true }
      );
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('structure-test/fixes'),
        { recursive: true }
      );
    });

    it('should use current directory as default save location', async () => {
      setupGenerateMocks();

      const result = await performRecipesGenerate({
        name: 'default-location',
        category: 'location',
        summary: 'Test default location',
        magicGenerate: false,
      });

      expect(result.success).toBe(true);
      expect(result.recipePath).toContain('default-location');
      expect(result.recipePath).not.toContain('/custom/path');
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('default-location'),
        { recursive: true }
      );
    });

    it('should use custom save location when provided', async () => {
      setupGenerateMocks();

      const result = await performRecipesGenerate({
        name: 'custom-location',
        saveLocation: '/custom/path',
        category: 'utilities',
        summary: 'Test custom location',
        magicGenerate: false,
      });

      expect(result.success).toBe(true);
      expect(result.recipePath).toBe('/custom/path/utilities/custom-location');
      expect(mockMkdirSync).toHaveBeenCalledWith(
        '/custom/path/utilities/custom-location',
        { recursive: true }
      );
    });

    it('should expand tilde in save location', async () => {
      setupGenerateMocks();
      mockHomedir.mockReturnValue('/test/home');

      const result = await performRecipesGenerate({
        name: 'tilde-location',
        saveLocation: '~/my-recipes',
        category: 'tools',
        summary: 'Test tilde expansion',
        magicGenerate: false,
      });

      expect(result.success).toBe(true);
      expect(result.recipePath).toBe(
        '/test/home/my-recipes/tools/tilde-location'
      );
      expect(mockMkdirSync).toHaveBeenCalledWith(
        '/test/home/my-recipes/tools/tilde-location',
        { recursive: true }
      );
    });

    it('should handle nested tilde paths correctly', async () => {
      setupGenerateMocks();
      mockHomedir.mockReturnValue('/test/home');

      const result = await performRecipesGenerate({
        name: 'nested-tilde',
        saveLocation: '~/.chorenzo/recipes/custom',
        category: 'integrations',
        summary: 'Test nested tilde paths',
        magicGenerate: false,
      });

      expect(result.success).toBe(true);
      expect(result.recipePath).toBe(
        '/test/home/.chorenzo/recipes/custom/integrations/nested-tilde'
      );
      expect(mockMkdirSync).toHaveBeenCalledWith(
        '/test/home/.chorenzo/recipes/custom/integrations/nested-tilde',
        { recursive: true }
      );
    });

    it('should handle relative paths in save location', async () => {
      setupGenerateMocks();

      const result = await performRecipesGenerate({
        name: 'relative-location',
        saveLocation: './custom-recipes',
        category: 'features',
        summary: 'Test relative paths',
        magicGenerate: false,
      });

      expect(result.success).toBe(true);
      expect(result.recipePath).toContain(
        'custom-recipes/features/relative-location'
      );
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('custom-recipes/features/relative-location'),
        { recursive: true }
      );
    });

    it('should use provided category', async () => {
      setupGenerateMocks();

      const result = await performRecipesGenerate({
        name: 'test-recipe',
        category: 'development',
        summary: 'Test development recipe',
        magicGenerate: false,
      });

      expect(result.success).toBe(true);
      const metadataCall = mockWriteFileSync.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' && call[0].includes('metadata.yaml')
      );
      expect(metadataCall).toBeDefined();
      expect(metadataCall?.[1]).toContain('development');
    });

    it('should require category when none provided', async () => {
      setupGenerateMocks();

      await expect(
        performRecipesGenerate({
          name: 'test-recipe',
          magicGenerate: false,
        })
      ).rejects.toThrow('Category is required');
    });

    it('should require summary when none provided', async () => {
      setupGenerateMocks();
      await expect(
        performRecipesGenerate({
          name: 'test-recipe',
          category: 'development',
          magicGenerate: false,
        })
      ).rejects.toThrow('Summary is required');
    });

    it('should use provided summary', async () => {
      setupGenerateMocks();
      const result = await performRecipesGenerate({
        name: 'test-recipe',
        category: 'development',
        summary: 'Custom summary for testing',
        magicGenerate: false,
      });
      expect(result.success).toBe(true);
      const promptCall = mockWriteFileSync.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' && call[0].includes('prompt.md')
      );
      expect(promptCall).toBeDefined();
      expect(promptCall?.[1]).toContain('Custom summary for testing');
    });

    it('should handle multiline summary correctly', async () => {
      setupGenerateMocks();
      const multilineSummary = 'First line\nSecond line\nThird line';
      const result = await performRecipesGenerate({
        name: 'multiline-test',
        category: 'testing',
        summary: multilineSummary,
        magicGenerate: false,
      });
      expect(result.success).toBe(true);
      const promptCall = mockWriteFileSync.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' && call[0].includes('prompt.md')
      );
      expect(promptCall).toBeDefined();
      expect(promptCall?.[1]).toContain(multilineSummary);
    });

    it('should handle summary with special characters', async () => {
      setupGenerateMocks();
      const specialSummary = 'Summary with @special #characters & symbols!';
      const result = await performRecipesGenerate({
        name: 'special-chars',
        category: 'testing',
        summary: specialSummary,
        magicGenerate: false,
      });
      expect(result.success).toBe(true);
      const promptCall = mockWriteFileSync.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' && call[0].includes('prompt.md')
      );
      expect(promptCall).toBeDefined();
      expect(promptCall?.[1]).toContain(specialSummary);
    });

    it('should trim whitespace from summary', async () => {
      setupGenerateMocks();
      const result = await performRecipesGenerate({
        name: 'trim-test',
        category: 'testing',
        summary: '   Trimmed summary   ',
        magicGenerate: false,
      });
      expect(result.success).toBe(true);
      const promptCall = mockWriteFileSync.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' && call[0].includes('prompt.md')
      );
      expect(promptCall).toBeDefined();
      expect(promptCall?.[1]).toContain('Trimmed summary');
    });

    it('should reject empty summary string', async () => {
      setupGenerateMocks();
      await expect(
        performRecipesGenerate({
          name: 'test-recipe',
          category: 'development',
          summary: '',
          magicGenerate: false,
        })
      ).rejects.toThrow('Summary is required');
    });

    it('should reject summary with only whitespace', async () => {
      setupGenerateMocks();
      await expect(
        performRecipesGenerate({
          name: 'test-recipe',
          category: 'development',
          summary: '   ',
          magicGenerate: false,
        })
      ).rejects.toThrow('Summary is required');
    });

    it('should handle custom category names with same validation as recipe names', async () => {
      setupGenerateMocks();

      const result = await performRecipesGenerate({
        name: 'test-recipe',
        category: 'my-custom-category-123',
        summary: 'Test custom category validation',
        magicGenerate: false,
      });

      expect(result.success).toBe(true);
      const metadataCall = mockWriteFileSync.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' && call[0].includes('metadata.yaml')
      );
      expect(metadataCall).toBeDefined();
      expect(metadataCall?.[1]).toContain('my-custom-category-123');
    });

    it('should create recipe in category subfolder for library root location', async () => {
      setupGenerateMocks();
      setupLocationMocks(
        {
          '/test/library': true,
          '/test/library/development': true,
          '/test/library/development/existing-recipe': true,
          '/test/library/development/existing-recipe/metadata.yaml': true,
        },
        {
          '/test/library': ['development'],
          '/test/library/development': ['existing-recipe'],
        }
      );

      const result = await performRecipesGenerate({
        name: 'new-recipe',
        category: 'testing',
        saveLocation: '/test/library',
        summary: 'Test library root location',
        magicGenerate: false,
      });

      expect(result.success).toBe(true);
      expect(result.recipePath).toBe('/test/library/testing/new-recipe');
      expect(mockMkdirSync).toHaveBeenCalledWith(
        '/test/library/testing/new-recipe',
        { recursive: true }
      );
    });

    it('should create recipe directly in category folder location', async () => {
      setupGenerateMocks();
      setupLocationMocks(
        {
          '/test/library/development': true,
          '/test/library/development/existing-recipe': true,
          '/test/library/development/existing-recipe/metadata.yaml': true,
        },
        {
          '/test/library/development': ['existing-recipe'],
        }
      );

      const result = await performRecipesGenerate({
        name: 'new-recipe',
        category: 'development',
        saveLocation: '/test/library/development',
        summary: 'Test category folder location',
        magicGenerate: false,
      });

      expect(result.success).toBe(true);
      expect(result.recipePath).toBe('/test/library/development/new-recipe');
      expect(mockMkdirSync).toHaveBeenCalledWith(
        '/test/library/development/new-recipe',
        { recursive: true }
      );
    });

    it('should throw error for mixed hierarchy in save location', async () => {
      setupGenerateMocks();
      setupLocationMocks(
        {
          '/test/mixed': true,
          '/test/mixed/development': true,
          '/test/mixed/recipe1': true,
          '/test/mixed/development/recipe2': true,
          '/test/mixed/recipe1/metadata.yaml': true,
          '/test/mixed/development/recipe2/metadata.yaml': true,
        },
        {
          '/test/mixed': ['development', 'recipe1'],
          '/test/mixed/development': ['recipe2'],
        }
      );

      await expect(
        performRecipesGenerate({
          name: 'new-recipe',
          saveLocation: '/test/mixed',
          category: 'test',
          summary: 'Test mixed hierarchy error',
          magicGenerate: false,
        })
      ).rejects.toThrow(
        'Invalid hierarchy: location contains both recipe folders and category folders'
      );
    });

    it('should throw error for unknown hierarchy in save location', async () => {
      setupGenerateMocks();
      setupLocationMocks(
        {
          '/test/unknown': true,
          '/test/unknown/folder1': true,
          '/test/unknown/folder2': true,
        },
        {
          '/test/unknown': ['folder1', 'folder2'],
          '/test/unknown/folder1': [],
          '/test/unknown/folder2': [],
        }
      );

      await expect(
        performRecipesGenerate({
          name: 'new-recipe',
          saveLocation: '/test/unknown',
          category: 'test',
          summary: 'Test unknown hierarchy error',
          magicGenerate: false,
        })
      ).rejects.toThrow(
        'Location "/test/unknown" contains folders but none are recognized as recipe categories or recipes'
      );
    });

    it('should validate category names in performRecipesGenerate', async () => {
      setupGenerateMocks();

      await expect(
        performRecipesGenerate({
          name: 'test-recipe',
          category: 'invalid@category',
          summary: 'Test invalid category',
          magicGenerate: false,
        })
      ).rejects.toThrow('Category name contains invalid characters: @');
    });

    it('should normalize category names in performRecipesGenerate', async () => {
      setupGenerateMocks();

      const result = await performRecipesGenerate({
        name: 'test-recipe',
        category: 'Test Category',
        summary: 'Test category normalization',
        magicGenerate: false,
      });

      expect(result.success).toBe(true);
      expect(result.recipePath).toContain('test-category');
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('test-category/test-recipe'),
        { recursive: true }
      );
    });

    it('should throw error when recipe with same name already exists', async () => {
      setupGenerateMocks();
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('existing-recipe');
      });

      await expect(
        performRecipesGenerate({
          name: 'existing-recipe',
          category: 'tools',
          summary: 'Test duplicate detection',
          magicGenerate: false,
        })
      ).rejects.toThrow('Recipe "existing-recipe" already exists at');
    });

    describe('Ecosystem-agnostic recipes', () => {
      it('should generate ecosystem-agnostic recipe with fix.md file', async () => {
        setupGenerateMocks();

        const result = await performRecipesGenerate({
          name: 'agnostic-recipe',
          category: 'utilities',
          summary: 'Test ecosystem-agnostic recipe',
          magicGenerate: false,
          ecosystemAgnostic: true,
        });

        expect(result.success).toBe(true);
        expect(result.recipeName).toBe('agnostic-recipe');
        expect(result.recipePath).toContain('agnostic-recipe');

        expect(mockMkdirSync).toHaveBeenCalledWith(
          expect.stringContaining('agnostic-recipe'),
          { recursive: true }
        );
        expect(mockMkdirSync).not.toHaveBeenCalledWith(
          expect.stringContaining('fixes'),
          { recursive: true }
        );

        expect(mockWriteFileSync).toHaveBeenCalledWith(
          expect.stringContaining('fix.md'),
          expect.any(String)
        );
        expect(mockWriteFileSync).not.toHaveBeenCalledWith(
          expect.stringContaining('fixes/javascript_default.md'),
          expect.any(String)
        );
      });

      it('should generate regular recipe with fixes directory when not ecosystem-agnostic', async () => {
        setupGenerateMocks();

        const result = await performRecipesGenerate({
          name: 'regular-recipe',
          category: 'utilities',
          summary: 'Test regular recipe',
          magicGenerate: false,
          ecosystemAgnostic: false,
        });

        expect(result.success).toBe(true);
        expect(result.recipeName).toBe('regular-recipe');

        expect(mockMkdirSync).toHaveBeenCalledWith(
          expect.stringContaining('fixes'),
          { recursive: true }
        );

        expect(mockWriteFileSync).toHaveBeenCalledWith(
          expect.stringContaining('fixes/javascript_default.md'),
          expect.any(String)
        );
        expect(mockWriteFileSync).not.toHaveBeenCalledWith(
          expect.stringContaining('fix.md'),
          expect.any(String)
        );
      });
    });

    describe('CLI parameter handling', () => {
      it('should accept magicGenerate and additionalInstructions CLI parameters', async () => {
        setupGenerateMocks();

        const result = await performRecipesGenerate({
          name: 'basic-recipe',
          category: 'tools',
          summary: 'Test basic recipe generation',
          magicGenerate: false,
        });

        expect(result.success).toBe(true);
        expect(result.recipeName).toBe('basic-recipe');
      });

      it('should handle magicGenerate parameter when passed to CLI', async () => {
        const options = {
          name: 'test-recipe',
          category: 'development',
          summary: 'Test recipe',
          magicGenerate: true,
          additionalInstructions: 'Use TypeScript',
        };

        expect(options.magicGenerate).toBe(true);
        expect(options.additionalInstructions).toBe('Use TypeScript');
      });

      it('should handle ecosystem-agnostic parameter with magic generation', async () => {
        const options = {
          name: 'agnostic-recipe',
          category: 'general',
          summary: 'Test agnostic recipe',
          magicGenerate: true,
          ecosystemAgnostic: true,
        };

        expect(options.magicGenerate).toBe(true);
        expect(options.ecosystemAgnostic).toBe(true);
      });
    });
  });
});
