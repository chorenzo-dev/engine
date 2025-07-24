import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import * as fs from 'fs';

const mockHomedir = jest.fn<() => string>(() => '/test/home');
const mockTmpdir = jest.fn<() => string>(() => '/tmp');
const mockExistsSync = jest.fn<(path: string) => boolean>();
const mockStatSync = jest.fn<(path: string) => fs.Stats>();
const mockReaddirSync = jest.fn<(path: string) => string[]>();
const mockReadFileSync = jest.fn<(path: string, encoding?: string) => string>();
const mockReadYaml = jest.fn<(path: string) => Promise<unknown>>();
const mockParseYaml = jest.fn<(content: string) => unknown>();
const mockReadJson = jest.fn<(path: string) => Promise<unknown>>();
const mockWriteJson = jest.fn<(path: string, data: unknown) => Promise<void>>();
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

jest.unstable_mockModule('../utils/yaml.utils', () => ({
  readYaml: mockReadYaml,
  parseYaml: mockParseYaml,
  writeYaml: jest.fn(),
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
  readJson: mockReadJson,
  writeJson: mockWriteJson,
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

  const createMockReadYaml = (
    options: {
      recipeId?: string;
      category?: string;
      variants?: Array<{ id: string; fix_prompt: string }>;
      requires?: Array<{ key: string; equals: string }>;
      provides?: string[];
    } = {}
  ) => {
    const {
      recipeId = 'test-recipe',
      category = 'test',
      variants = [{ id: 'basic', fix_prompt: 'fixes/basic.md' }],
      requires = [],
      provides = ['test-functionality'],
    } = options;

    return (filePath: string) => {
      if (filePath.includes('config.yaml')) {
        return Promise.resolve({
          libraries: {
            'test-recipe': {
              repo: 'https://github.com/test/test-recipe.git',
              ref: 'main',
            },
          },
        });
      }
      return Promise.resolve({
        id: recipeId,
        category,
        summary: 'Test recipe',
        ecosystems: [
          {
            id: 'javascript',
            default_variant: 'basic',
            variants,
          },
        ],
        provides,
        requires,
      });
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
    mockReadYaml.mockImplementation(createMockReadYaml());
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

    mockReadYaml.mockImplementation(() =>
      Promise.resolve({
        id: 'recipe',
        category: 'test',
        summary: 'Test recipe',
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
      })
    );

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

    mockReadYaml.mockImplementation((filePath: string) => {
      if (filePath.includes('recipe1/metadata.yaml')) {
        return Promise.resolve({
          id: 'recipe1',
          category: 'test',
          summary: 'Recipe 1',
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
        return Promise.resolve({
          id: 'recipe2',
          category: 'test',
          summary: 'Recipe 2',
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
      return Promise.resolve({});
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

    mockReadYaml.mockImplementation(() =>
      Promise.resolve({
        id: 'nested-recipe',
        category: 'test',
        summary: 'Nested recipe',
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
      })
    );

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

    mockReadYaml.mockImplementation(() =>
      Promise.resolve({
        id: 'test-recipe',
        category: 'test',
        summary: 'Test recipe',
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
      })
    );

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

      mockReadYaml.mockImplementation(() => {
        throw new Error('Invalid YAML syntax');
      });

      await expect(performRecipesValidate(options)).rejects.toThrow(
        'Failed to parse metadata.yaml: Invalid YAML syntax'
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

      mockReadYaml.mockImplementation(
        createMockReadYaml({
          recipeId: 'snake_case_recipe',
          provides: ['test_feature'],
        })
      );

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

      mockReadYaml.mockImplementation(
        createMockReadYaml({
          category: 'BadCategory',
          provides: ['test_feature'],
        })
      );

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
    const setupApplyMocks = () => {
      mockParseYaml.mockReturnValue({
        plan: { outputs: { 'test_feature.exists': true } },
      });
      mockReadJson.mockResolvedValue({});
      mockWriteJson.mockResolvedValue(undefined);
    };

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

    const setupStandardFileMocks = () => {
      mockReadFileSync.mockImplementation((filePath) => {
        if (filePath.includes('prompt.md'))
          return '## Goal\\nTest goal\\n\\n## Investigation\\nTest investigation\\n\\n## Expected Output\\nTest output';
        return '';
      });
    };

    const setupStandardAnalysisJsonMock = () => {
      mockReadJson.mockImplementation((path) => {
        if (path.includes('analysis.json')) {
          return Promise.resolve({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
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
        return Promise.resolve({});
      });
    };

    const setupStandardRecipeYamlMock = () => {
      mockReadYaml.mockImplementation(
        createMockReadYaml({
          provides: ['test_feature.exists'],
        })
      );
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
      setupStandardFileMocks();
      setupStandardAnalysisJsonMock();
      setupStandardRecipeYamlMock();
      setupSuccessfulQueryMock();
    };

    beforeEach(() => {
      setupApplyMocks();
    });

    it('should apply recipe successfully', async () => {
      setupStandardApplyScenario();

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        return '';
      });

      const result = await performRecipesApply({
        recipe: 'test-recipe',
        progress: false,
      });

      expect(result).toBeDefined();
      expect(result.summary.successfulProjects).toBe(1);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should verify progress events and thinking state during recipe application', async () => {
      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        return '';
      });

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

      mockReadJson.mockImplementation((path) => {
        if (path.includes('analysis.json')) {
          return Promise.resolve({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
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
        return Promise.resolve({});
      });

      mockReadYaml.mockImplementation((filePath: string) => {
        if (filePath.includes('config.yaml')) {
          return Promise.resolve({
            libraries: {
              'test-recipe': {
                repo: 'https://github.com/test/test-recipe.git',
                ref: 'main',
              },
            },
          });
        }
        return Promise.resolve({
          id: 'test-recipe',
          category: 'test',
          summary: 'Test recipe',
          ecosystems: [
            {
              id: 'javascript',
              default_variant: 'basic',
              variants: [{ id: 'basic', fix_prompt: 'Basic fix' }],
            },
          ],
          provides: ['test_feature.exists'],
          requires: [],
        });
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
      setupStandardRecipeYamlMock();
      setupSuccessfulQueryMock();

      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) return false;
        if (path.includes('.chorenzo/recipes')) return true;
        if (path.includes('test-recipe')) return true;
        if (path.includes('metadata.yaml')) return true;
        if (path.includes('prompt.md')) return true;
        if (path.includes('apply_recipe.md')) return true;
        return true;
      });

      mockReadFileSync.mockImplementation((filePath) => {
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
        return '';
      });

      mockPerformAnalysis.mockResolvedValue({
        analysis: {
          isMonorepo: false,
          hasWorkspacePackageManager: false,
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

      mockReadFileSync.mockImplementation((filePath) => {
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
        if (filePath.includes('state.json'))
          return JSON.stringify({
            'prerequisite.exists': {
              value: false,
              source: 'other-recipe',
              timestamp: '2024-01-01T00:00:00Z',
            },
          });
        return '';
      });

      mockReadYaml.mockImplementation(
        createMockReadYaml({
          provides: ['test_feature.exists'],
          requires: [{ key: 'prerequisite.exists', equals: 'true' }],
        })
      );

      await expect(
        performRecipesApply({
          recipe: 'test-recipe',
          progress: false,
        })
      ).rejects.toThrow('unsatisfied dependencies');
    });

    it('should handle execution failures gracefully', async () => {
      setupStandardFileSystemMocks();
      setupStandardAnalysisJsonMock();
      setupStandardRecipeYamlMock();
      setupErrorQueryMock();

      mockReadFileSync.mockImplementation((filePath) => {
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
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
      setupStandardAnalysisJsonMock();
      setupSuccessfulQueryMock();

      mockReadFileSync.mockImplementation((filePath) => {
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
        return '';
      });

      mockReadYaml.mockImplementation(
        createMockReadYaml({
          variants: [
            { id: 'basic', fix_prompt: 'Basic fix' },
            { id: 'advanced', fix_prompt: 'Advanced fix' },
          ],
          provides: ['test_feature.exists'],
        })
      );

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

      mockReadFileSync.mockImplementation((filePath) => {
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
        return '';
      });

      mockReadJson.mockImplementation((path) => {
        if (path.includes('analysis.json')) {
          return Promise.resolve({
            isMonorepo: true,
            hasWorkspacePackageManager: true,
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
        return Promise.resolve({});
      });

      mockReadYaml.mockImplementation((filePath: string) => {
        if (filePath.includes('config.yaml')) {
          return Promise.resolve({
            libraries: {
              'test-recipe': {
                repo: 'https://github.com/test/test-recipe.git',
                ref: 'main',
              },
            },
          });
        }
        return Promise.resolve({
          id: 'test-recipe',
          category: 'test',
          summary: 'Test recipe',
          ecosystems: [
            {
              id: 'javascript',
              default_variant: 'basic',
              variants: [{ id: 'basic', fix_prompt: 'Basic fix' }],
            },
          ],
          provides: ['test_feature.exists'],
          requires: [],
        });
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

      mockReadFileSync.mockImplementation((filePath) => {
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
        return '';
      });

      mockReadJson.mockImplementation((path) => {
        if (path.includes('analysis.json')) {
          return Promise.resolve({
            isMonorepo: true,
            hasWorkspacePackageManager: true,
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
        return Promise.resolve({});
      });

      mockReadYaml.mockImplementation((filePath: string) => {
        if (filePath.includes('config.yaml')) {
          return Promise.resolve({
            libraries: {
              'test-recipe': {
                repo: 'https://github.com/test/test-recipe.git',
                ref: 'main',
              },
            },
          });
        }
        return Promise.resolve({
          id: 'test-recipe',
          category: 'test',
          summary: 'Test recipe',
          ecosystems: [
            {
              id: 'javascript',
              default_variant: 'basic',
              variants: [{ id: 'basic', fix_prompt: 'Basic fix' }],
            },
          ],
          provides: ['test_feature.exists'],
          requires: [],
        });
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

      mockReadFileSync.mockImplementation((filePath) => {
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
        return '';
      });

      mockReadJson.mockImplementation((path) => {
        if (path.includes('state.json')) {
          return Promise.resolve({
            'prerequisite.version': '1.0.0',
          });
        }
        return Promise.resolve({});
      });

      mockReadYaml.mockImplementation(
        createMockReadYaml({
          provides: ['test_feature.exists'],
          requires: [{ key: 'prerequisite.version', equals: '2.0.0' }],
        })
      );

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

      mockReadFileSync.mockImplementation((filePath) => {
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
        return '';
      });

      mockReadJson.mockImplementation((path) => {
        if (path.includes('analysis.json')) {
          return Promise.resolve({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
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
        return Promise.resolve({});
      });

      mockReadYaml.mockImplementation((filePath: string) => {
        if (filePath.includes('config.yaml')) {
          return Promise.resolve({
            libraries: {
              'test-recipe': {
                repo: 'https://github.com/test/test-recipe.git',
                ref: 'main',
              },
            },
          });
        }
        return Promise.resolve({
          id: 'test-recipe',
          category: 'test',
          summary: 'Test recipe',
          ecosystems: [
            {
              id: 'javascript',
              default_variant: 'basic',
              variants: [{ id: 'basic', fix_prompt: 'Basic fix' }],
            },
          ],
          provides: ['test_feature.exists'],
          requires: [],
        });
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

      mockReadFileSync.mockImplementation((filePath) => {
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
        return '';
      });

      mockReadJson.mockImplementation((path) => {
        if (path.includes('analysis.json')) {
          throw new Error('Invalid JSON syntax');
        }
        return Promise.resolve({});
      });

      mockReadYaml.mockImplementation((filePath: string) => {
        if (filePath.includes('config.yaml')) {
          return Promise.resolve({
            libraries: {
              'test-recipe': {
                repo: 'https://github.com/test/test-recipe.git',
                ref: 'main',
              },
            },
          });
        }
        return Promise.resolve({
          id: 'test-recipe',
          category: 'test',
          summary: 'Test recipe',
          ecosystems: [
            {
              id: 'javascript',
              default_variant: 'basic',
              variants: [{ id: 'basic', fix_prompt: 'Basic fix' }],
            },
          ],
          provides: ['test_feature.exists'],
          requires: [],
        });
      });

      mockPerformAnalysis.mockResolvedValue({
        analysis: {
          isMonorepo: false,
          hasWorkspacePackageManager: false,
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

      mockReadFileSync.mockImplementation((filePath) => {
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
        return '';
      });

      mockReadYaml.mockImplementation((filePath: string) => {
        if (filePath.includes('config.yaml')) {
          return Promise.resolve({
            libraries: {
              'test-recipe': {
                repo: 'https://github.com/test/test-recipe.git',
                ref: 'main',
              },
            },
          });
        }
        return Promise.resolve({
          id: 'test-recipe',
          category: 'test',
          summary: 'Test recipe',
          ecosystems: [
            {
              id: 'javascript',
              default_variant: 'basic',
              variants: [{ id: 'basic', fix_prompt: 'Basic fix' }],
            },
          ],
          provides: ['test_feature.exists'],
          requires: [],
        });
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

      mockReadFileSync.mockImplementation((filePath) => {
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
        return '';
      });

      mockReadJson.mockImplementation((path) => {
        if (path.includes('analysis.json')) {
          return Promise.resolve({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
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
        return Promise.resolve({});
      });

      mockReadYaml.mockImplementation((filePath: string) => {
        if (filePath.includes('config.yaml')) {
          return Promise.resolve({
            libraries: {
              'test-recipe': {
                repo: 'https://github.com/test/test-recipe.git',
                ref: 'main',
              },
            },
          });
        }
        return Promise.resolve({
          id: 'test-recipe',
          category: 'test',
          summary: 'Test recipe',
          ecosystems: [
            {
              id: 'javascript',
              default_variant: 'basic',
              variants: [{ id: 'basic', fix_prompt: 'Basic fix' }],
            },
          ],
          provides: ['test_feature.exists'],
          requires: [],
        });
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

      mockReadFileSync.mockImplementation((filePath) => {
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
        return '';
      });

      mockReadJson.mockImplementation((path) => {
        if (path.includes('analysis.json')) {
          return Promise.resolve({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
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
        return Promise.resolve({});
      });

      mockReadYaml.mockImplementation((filePath: string) => {
        if (filePath.includes('config.yaml')) {
          return Promise.resolve({
            libraries: {
              'test-recipe': {
                repo: 'https://github.com/test/test-recipe.git',
                ref: 'main',
              },
            },
          });
        }
        return Promise.resolve({
          id: 'test-recipe',
          category: 'test',
          summary: 'Test recipe',
          ecosystems: [
            {
              id: 'javascript',
              default_variant: 'basic',
              variants: [{ id: 'basic', fix_prompt: 'Basic fix' }],
            },
          ],
          provides: ['test_feature.exists'],
          requires: [],
        });
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

    it('should handle state file read errors', async () => {
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

      mockReadFileSync.mockImplementation((filePath) => {
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
        return '';
      });

      mockReadJson.mockImplementation((path) => {
        if (path.includes('analysis.json')) {
          return Promise.resolve({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
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
        if (path.includes('state.json')) {
          throw new Error('Permission denied');
        }
        return Promise.resolve({});
      });

      mockReadYaml.mockImplementation((filePath: string) => {
        if (filePath.includes('config.yaml')) {
          return Promise.resolve({
            libraries: {
              'test-recipe': {
                repo: 'https://github.com/test/test-recipe.git',
                ref: 'main',
              },
            },
          });
        }
        return Promise.resolve({
          id: 'test-recipe',
          category: 'test',
          summary: 'Test recipe',
          ecosystems: [
            {
              id: 'javascript',
              default_variant: 'basic',
              variants: [{ id: 'basic', fix_prompt: 'Basic fix' }],
            },
          ],
          provides: ['test_feature.exists'],
          requires: [],
        });
      });

      await expect(
        performRecipesApply({
          recipe: 'test-recipe',
          progress: false,
        })
      ).rejects.toThrow('Failed to read state file');
    });

    it('should handle empty recipe application result', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (path.includes('analysis.json')) return true;
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

      mockReadFileSync.mockImplementation((filePath) => {
        if (filePath.includes('prompt.md'))
          return '## Goal\nTest\n## Investigation\nTest\n## Expected Output\nTest';
        return '';
      });

      mockReadJson.mockImplementation((path) => {
        if (path.includes('analysis.json')) {
          return Promise.resolve({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
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
        return Promise.resolve({});
      });

      mockReadYaml.mockImplementation((filePath: string) => {
        if (filePath.includes('config.yaml')) {
          return Promise.resolve({
            libraries: {
              'test-recipe': {
                repo: 'https://github.com/test/test-recipe.git',
                ref: 'main',
              },
            },
          });
        }
        return Promise.resolve({
          id: 'test-recipe',
          category: 'test',
          summary: 'Test recipe',
          ecosystems: [
            {
              id: 'javascript',
              default_variant: 'basic',
              variants: [{ id: 'basic', fix_prompt: 'Basic fix' }],
            },
          ],
          provides: ['test_feature.exists'],
          requires: [],
        });
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
      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        return '';
      });

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

      mockReadJson.mockImplementation((path) => {
        if (path.includes('analysis.json')) {
          return Promise.resolve({
            isMonorepo: false,
            hasWorkspacePackageManager: false,
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
        return Promise.resolve({});
      });

      mockReadYaml.mockImplementation((filePath: string) => {
        if (filePath.includes('config.yaml')) {
          return Promise.resolve({
            libraries: {
              'test-recipe': {
                repo: 'https://github.com/test/test-recipe.git',
                ref: 'main',
              },
            },
          });
        }
        return Promise.resolve({
          id: 'test-recipe',
          category: 'test',
          summary: 'Test recipe',
          ecosystems: [
            {
              id: 'javascript',
              default_variant: 'basic',
              variants: [{ id: 'basic', fix_prompt: 'Basic fix' }],
            },
          ],
          provides: ['test_feature.exists'],
          requires: [],
        });
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

      mockReadFileSync.mockImplementation((filePath: string) => {
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

      mockReadFileSync.mockImplementation((filePath: string) => {
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
  });
});
