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

import {
  createLibraryConfig,
  createMockYamlData,
  mockExistsSync,
  mockHomedir,
  mockMkdirSync,
  mockPerformAnalysis,
  mockQuery,
  mockReadFileSync,
  mockReaddirSync,
  mockStatSync,
  mockWriteFileAtomicSync,
  mockWriteFileSync,
  setupDefaultMocks,
  setupLocationMocks,
  setupRecipeExistenceChecks,
} from './recipes.test-utils';

describe('Recipes Command Integration Tests', () => {
  let performRecipesValidate: typeof import('./recipes').performRecipesValidate;
  let performRecipesApply: typeof import('./recipes').performRecipesApply;

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
              fix_prompt: 'variants/basic.md',
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
      } else if (filePath.includes('fix.md')) {
        return 'Basic fix prompt content';
      } else if (filePath.includes('variants/basic.md')) {
        return 'Basic variant fix prompt content';
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

    const recipePathChecks: Array<[string, boolean]> = [
      ['/path/to/library', true],
      ['/path/to/library/metadata.yaml', false],
      ['/path/to/library/recipe1/variants', true],
      ['/path/to/library/recipe2/variants', true],
      ['/path/to/library/recipe1/variants/basic.md', true],
      ['/path/to/library/recipe2/variants/basic.md', true],
    ];
    setupRecipeExistenceChecks('/path/to/library/recipe1', recipePathChecks);
    setupRecipeExistenceChecks('/path/to/library/recipe2', recipePathChecks);

    mockExistsSync.mockImplementation((filePath: string) => {
      const result = recipePathChecks.find(([path]) => path === filePath);
      return result ? result[1] : false;
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
      } else if (filePath.includes('fix.md')) {
        return 'Basic fix prompt content';
      } else if (filePath.includes('variants/basic.md')) {
        return 'Basic variant fix prompt content';
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
              variants: [{ id: 'basic', fix_prompt: 'variants/basic.md' }],
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
              variants: [{ id: 'basic', fix_prompt: 'variants/basic.md' }],
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

    const recipePathChecks: Array<[string, boolean]> = [
      ['/test/home/.chorenzo/recipes', true],
      ['/test/home/.chorenzo/recipes/lib1', true],
      ['/test/home/.chorenzo/recipes/lib2', true],
      ['/test/home/.chorenzo/recipes/lib1/nested-recipe/variants', true],
      [
        '/test/home/.chorenzo/recipes/lib1/nested-recipe/variants/basic.md',
        true,
      ],
    ];
    setupRecipeExistenceChecks(
      '/test/home/.chorenzo/recipes/lib1/nested-recipe',
      recipePathChecks
    );

    mockExistsSync.mockImplementation((filePath: string) => {
      const result = recipePathChecks.find(([path]) => path === filePath);
      return result ? result[1] : false;
    });

    mockStatSync.mockImplementation(
      (filePath: string) =>
        ({
          isDirectory: () => {
            return (
              filePath === '/test/home/.chorenzo/recipes' ||
              filePath === '/test/home/.chorenzo/recipes/lib1' ||
              filePath === '/test/home/.chorenzo/recipes/lib2' ||
              filePath === '/test/home/.chorenzo/recipes/lib1/nested-recipe' ||
              filePath ===
                '/test/home/.chorenzo/recipes/lib1/nested-recipe/variants'
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
      } else if (
        dirPath === '/test/home/.chorenzo/recipes/lib1/nested-recipe/variants'
      ) {
        return ['basic.md'];
      }
      return [];
    });

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('prompt.md')) {
        return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
      } else if (filePath.includes('fix.md')) {
        return 'Basic fix prompt content';
      } else if (filePath.includes('variants/basic.md')) {
        return 'Basic variant fix prompt content';
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
                  fix_prompt: 'variants/basic.md',
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
      } else if (filePath.includes('fix.md')) {
        return 'Basic fix prompt content';
      } else if (filePath.includes('variants/basic.md')) {
        return 'Basic variant fix prompt content';
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
                  fix_prompt: 'variants/basic.md',
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

    it('should find local recipes when library search returns nothing', async () => {
      const options = { target: 'local-recipe' };

      const recipePathChecks: Array<[string, boolean]> = [
        ['/test/home/.chorenzo/recipes', false],
        [process.cwd(), true],
        [`${process.cwd()}/recipes`, true],
        [`${process.cwd()}/recipes/local-recipe/apply_recipe.md`, true],
        [`${process.cwd()}/recipes/local-recipe/variants`, true],
        [`${process.cwd()}/recipes/local-recipe/variants/basic.md`, true],
        [`${process.cwd()}/.gitignore`, false],
      ];
      setupRecipeExistenceChecks(
        `${process.cwd()}/recipes/local-recipe`,
        recipePathChecks
      );

      mockExistsSync.mockImplementation((filePath: string) => {
        const result = recipePathChecks.find(([path]) => path === filePath);
        return result ? result[1] : false;
      });

      mockStatSync.mockImplementation(
        (filePath: string) =>
          ({
            isDirectory: () => !filePath.includes('.'),
            isFile: () => filePath.includes('.'),
          }) as fs.Stats
      );

      mockReaddirSync.mockImplementation((dirPath: string) => {
        if (dirPath === process.cwd()) {
          return ['recipes', 'src', 'package.json', 'README.md'];
        }
        if (dirPath === `${process.cwd()}/recipes`) {
          return ['local-recipe', 'another-recipe'];
        }
        if (dirPath === `${process.cwd()}/recipes/local-recipe`) {
          return [
            'metadata.yaml',
            'prompt.md',
            'fix.md',
            'apply_recipe.md',
            'variants',
          ];
        }
        if (dirPath === `${process.cwd()}/recipes/local-recipe/variants`) {
          return ['basic.md'];
        }
        return [];
      });

      const mockYamlData = createMockYamlData({
        recipeId: 'local-recipe',
        category: 'local',
        provides: ['local-feature'],
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('local-recipe/metadata.yaml')) {
          return yamlStringify(mockYamlData.metadata);
        }
        if (filePath.includes('local-recipe/prompt.md')) {
          return '## Goal\nLocal recipe goal\n\n## Investigation\nLocal investigation\n\n## Expected Output\nLocal output';
        }
        if (filePath.includes('local-recipe/fix.md')) {
          return 'Local fix content';
        }
        if (filePath.includes('local-recipe/apply_recipe.md')) {
          return 'Apply local recipe';
        }
        if (filePath.includes('local-recipe/variants/basic.md')) {
          return 'Basic variant content';
        }
        return '';
      });

      const result = await performRecipesValidate(options);

      expect(result.context.recipesValidated).toEqual(['local-recipe']);
      expect(result.context.resolvedPath).toBe('local-recipe');
      expect(result.context.inputType).toBe('recipe-name');
      expect(result.messages.some((msg) => msg.type === 'success')).toBe(true);
    });

    it('should respect depth limit when searching for local recipes', async () => {
      const options = { target: 'deep-recipe' };
      const cwd = process.cwd();

      mockExistsSync.mockImplementation((filePath: string) => {
        if (filePath === '/test/home/.chorenzo/recipes') {
          return false;
        }
        if (
          filePath === cwd ||
          filePath.startsWith(`${cwd}/level1`) ||
          filePath === `${cwd}/level1/level2`
        ) {
          return true;
        }
        if (filePath === `${cwd}/.gitignore`) {
          return false;
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

      let searchedPaths: string[] = [];
      mockReaddirSync.mockImplementation((dirPath: string) => {
        searchedPaths.push(dirPath);

        if (dirPath === cwd) {
          return ['level1', 'src', 'package.json'];
        }
        if (dirPath === `${cwd}/level1`) {
          return ['level2', 'file.js'];
        }
        if (dirPath === `${cwd}/level1/level2`) {
          return ['level3'];
        }
        if (dirPath === `${cwd}/level1/level2/level3`) {
          return ['deep-recipe', 'too-deep-recipe'];
        }
        return [];
      });

      mockReadFileSync.mockImplementation(() => {
        return '';
      });

      await expect(performRecipesValidate(options)).rejects.toThrow(
        "Recipe 'deep-recipe' not found"
      );

      expect(searchedPaths).toContain(cwd);
      expect(searchedPaths).toContain(`${cwd}/level1`);
      expect(searchedPaths).toContain(`${cwd}/level1/level2`);
      expect(searchedPaths).not.toContain(`${cwd}/level1/level2/level3`);
    });

    it('should respect folder limit when searching for local recipes', async () => {
      const options = { target: 'recipe-in-many-folders' };
      const cwd = process.cwd();

      mockExistsSync.mockImplementation((filePath: string) => {
        if (filePath === '/test/home/.chorenzo/recipes') {
          return false;
        }
        if (filePath === cwd || filePath.startsWith(`${cwd}/folder`)) {
          return true;
        }
        if (filePath === `${cwd}/.gitignore`) {
          return false;
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

      let searchedFolderCount = 0;
      mockReaddirSync.mockImplementation((dirPath: string) => {
        searchedFolderCount++;

        if (dirPath === cwd) {
          const folders = [];
          for (let i = 1; i <= 60; i++) {
            folders.push(`folder${i}`);
          }
          return folders;
        }
        if (dirPath.includes('/folder')) {
          return ['subfolder1', 'subfolder2', 'file.js'];
        }
        return [];
      });

      await expect(performRecipesValidate(options)).rejects.toThrow(
        "Recipe 'recipe-in-many-folders' not found"
      );

      expect(searchedFolderCount).toBeLessThanOrEqual(50);
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
    it('should reject .applied suffix in provides field', async () => {
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
        provides: ['my-recipe.applied', 'another.applied', 'valid.key'],
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
              'Recipe provides list cannot contain reserved keywords: my-recipe.applied'
            )
        )
      ).toBe(true);
      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'error' &&
            msg.text.includes(
              'Recipe provides list cannot contain reserved keywords: another.applied'
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
        if (filePath.includes('fix.md')) {
          return 'Base fix instructions for all variants.';
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
        'Unknown error occurred'
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
          yes: true,
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
        ] = createLibraryConfig('project-only-recipe');

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

        await expect(performRecipesValidate(options)).rejects.toThrow(
          'Missing required fix.md file'
        );
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
        expect.stringContaining('variants'),
        { recursive: true }
      );
      expect(mockWriteFileSync).toHaveBeenCalledTimes(4);
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
        expect.stringContaining('fix.md'),
        expect.stringContaining('render-test')
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('variants/javascript_default.md'),
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
        expect.stringContaining('structure-test/variants'),
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
        expect(mockMkdirSync).toHaveBeenCalledWith(
          expect.stringContaining('variants'),
          { recursive: true }
        );

        expect(mockWriteFileSync).toHaveBeenCalledWith(
          expect.stringContaining('fix.md'),
          expect.any(String)
        );
        expect(mockWriteFileSync).not.toHaveBeenCalledWith(
          expect.stringContaining('variants/javascript_default.md'),
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
          expect.stringContaining('variants'),
          { recursive: true }
        );

        expect(mockWriteFileSync).toHaveBeenCalledWith(
          expect.stringContaining('fix.md'),
          expect.any(String)
        );
        expect(mockWriteFileSync).toHaveBeenCalledWith(
          expect.stringContaining('variants/javascript_default.md'),
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

      it('should handle ecosystem-specific parameter', async () => {
        setupGenerateMocks();

        const result = await performRecipesGenerate({
          name: 'specific-recipe',
          category: 'utilities',
          summary: 'Test ecosystem-specific recipe',
          magicGenerate: false,
          ecosystemAgnostic: false,
        });

        expect(result.success).toBe(true);
        expect(result.recipeName).toBe('specific-recipe');

        expect(mockMkdirSync).toHaveBeenCalledWith(
          expect.stringContaining('variants'),
          { recursive: true }
        );

        expect(mockWriteFileSync).toHaveBeenCalledWith(
          expect.stringContaining('fix.md'),
          expect.any(String)
        );
        expect(mockWriteFileSync).toHaveBeenCalledWith(
          expect.stringContaining('variants/javascript_default.md'),
          expect.any(String)
        );
      });

      it('should convert ecosystemSpecific to ecosystemAgnostic internally', async () => {
        setupGenerateMocks();

        const result = await performRecipesGenerate({
          name: 'conversion-test',
          category: 'utilities',
          summary: 'Test flag conversion',
          magicGenerate: false,
          ecosystemAgnostic: true,
        });

        expect(result.success).toBe(true);

        expect(mockMkdirSync).toHaveBeenCalledWith(
          expect.stringContaining('variants'),
          { recursive: true }
        );

        expect(mockWriteFileSync).toHaveBeenCalledWith(
          expect.stringContaining('fix.md'),
          expect.any(String)
        );
      });

      it('should handle CLI flag conversion properly', () => {
        const ecosystemSpecificToAgnostic = false;
        expect(ecosystemSpecificToAgnostic).toBe(false);

        const ecosystemAgnosticFlag = true;
        expect(ecosystemAgnosticFlag).toBe(true);
      });
    });
  });

  describe('Code Sample Validation Integration', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      setupDefaultMocks();
    });

    it('should run code sample validation during recipe validation and handle failures gracefully', async () => {
      const recipesModule = await import('./recipes');
      const performRecipesValidate = recipesModule.performRecipesValidate;
      mockExistsSync.mockImplementation((filePath: string) => {
        if (filePath === '/path/to/recipe-with-violations') {
          return true;
        }
        if (filePath === '/path/to/recipe-with-violations/metadata.yaml') {
          return true;
        }
        if (filePath === '/path/to/recipe-with-violations/prompt.md') {
          return true;
        }
        if (filePath === '/path/to/recipe-with-violations/fix.md') {
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
        if (filePath === '/path/to/recipe-with-violations/metadata.yaml') {
          return yamlStringify({
            id: 'recipe-with-violations',
            category: 'test',
            summary: 'Recipe with code sample violations',
            level: 'workspace-preferred',
            ecosystems: [],
            provides: [],
            requires: [],
          });
        }
        if (filePath === '/path/to/recipe-with-violations/prompt.md') {
          return '## Goal\nTest goal\n## Investigation\nTest investigation\n## Expected Output\nTest output';
        }
        if (filePath === '/path/to/recipe-with-violations/fix.md') {
          return '```javascript\nconst YOUR_API_KEY = "placeholder";\nconsole.log("TODO: implement this");\n```';
        }
        if (filePath.includes('validation/code_sample_validation.md')) {
          return 'Validate code samples in: {{#each files}}{{this.path}}{{/each}}';
        }
        return '';
      });

      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          result: JSON.stringify({
            valid: false,
            violations: [
              {
                file: 'fix.md',
                line: 2,
                type: 'generic_placeholder',
                description: 'Uses generic placeholder YOUR_API_KEY',
                suggestion:
                  'Use a specific example like process.env.OPENAI_API_KEY',
                codeSnippet: 'const YOUR_API_KEY = "placeholder";',
              },
              {
                file: 'fix.md',
                line: 3,
                type: 'incomplete_fragment',
                description: 'Contains TODO comment indicating incomplete code',
                suggestion: 'Provide complete implementation example',
                codeSnippet: 'console.log("TODO: implement this");',
              },
            ],
            summary: {
              totalFiles: 1,
              filesWithViolations: 1,
              totalViolations: 2,
              violationTypes: {
                generic_placeholder: 1,
                incomplete_fragment: 1,
                abstract_pseudocode: 0,
                overly_simplistic: 0,
              },
            },
          }),
        };
      });

      const result = await performRecipesValidate({
        target: '/path/to/recipe-with-violations',
      });

      expect(result.context.target).toBe('/path/to/recipe-with-violations');
      expect(result.context.recipesValidated).toEqual([
        'recipe-with-violations',
      ]);
      expect(result.messages).toBeDefined();

      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'error' &&
            msg.text.includes(
              "Recipe 'recipe-with-violations' has validation errors:"
            )
        )
      ).toBe(true);

      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'warning' && msg.text.includes('Code Sample Issues:')
        )
      ).toBe(true);
    });

    it('should integrate code sample validation into recipe validation workflow', async () => {
      const recipesModule = await import('./recipes');
      const performRecipesValidate = recipesModule.performRecipesValidate;
      mockExistsSync.mockImplementation((filePath: string) => {
        if (filePath === '/path/to/recipe-integration-test') {
          return true;
        }
        if (filePath === '/path/to/recipe-integration-test/metadata.yaml') {
          return true;
        }
        if (filePath === '/path/to/recipe-integration-test/prompt.md') {
          return true;
        }
        if (filePath === '/path/to/recipe-integration-test/fix.md') {
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
        if (filePath === '/path/to/recipe-integration-test/metadata.yaml') {
          return yamlStringify({
            id: 'recipe-integration-test',
            category: 'test',
            summary: 'Integration test recipe',
            level: 'workspace-preferred',
            ecosystems: [],
            provides: [],
            requires: [],
          });
        }
        if (filePath === '/path/to/recipe-integration-test/prompt.md') {
          return '## Goal\nTest goal\n## Investigation\nTest investigation\n## Expected Output\nTest output';
        }
        if (filePath === '/path/to/recipe-integration-test/fix.md') {
          return 'Integration test content';
        }
        if (filePath.includes('validation/code_sample_validation.md')) {
          return 'Validate code samples in: {{#each files}}{{this.path}}{{/each}}';
        }
        return '';
      });

      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          result: JSON.stringify({
            valid: true,
            violations: [],
            summary: {
              totalFiles: 1,
              filesWithViolations: 0,
              totalViolations: 0,
              violationTypes: {
                generic_placeholder: 0,
                incomplete_fragment: 0,
                abstract_pseudocode: 0,
                overly_simplistic: 0,
              },
            },
          }),
        };
      });

      const result = await performRecipesValidate({
        target: '/path/to/recipe-integration-test',
      });

      expect(result.context.target).toBe('/path/to/recipe-integration-test');
      expect(result.context.recipesValidated).toEqual([
        'recipe-integration-test',
      ]);

      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'success' &&
            msg.text.includes("Recipe 'recipe-integration-test' is valid")
        )
      ).toBe(true);

      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'warning' && msg.text.includes('Code Sample Issues:')
        )
      ).toBe(false);

      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'warning' &&
            msg.text.includes('Code sample validation failed')
        )
      ).toBe(false);
    });

    it('should handle code sample validation failures gracefully', async () => {
      const recipesModule = await import('./recipes');
      const performRecipesValidate = recipesModule.performRecipesValidate;
      mockExistsSync.mockImplementation((filePath: string) => {
        if (filePath === '/path/to/recipe-validation-error') {
          return true;
        }
        if (filePath === '/path/to/recipe-validation-error/metadata.yaml') {
          return true;
        }
        if (filePath === '/path/to/recipe-validation-error/prompt.md') {
          return true;
        }
        if (filePath === '/path/to/recipe-validation-error/fix.md') {
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
        if (filePath === '/path/to/recipe-validation-error/metadata.yaml') {
          return yamlStringify({
            id: 'recipe-validation-error',
            category: 'test',
            summary: 'Recipe that causes validation error',
            level: 'workspace-preferred',
            ecosystems: [],
            provides: [],
            requires: [],
          });
        }
        if (filePath === '/path/to/recipe-validation-error/prompt.md') {
          return '## Goal\nTest goal\n## Investigation\nTest investigation\n## Expected Output\nTest output';
        }
        if (filePath === '/path/to/recipe-validation-error/fix.md') {
          return 'Some fix content';
        }
        if (filePath.includes('validation/code_sample_validation.md')) {
          return 'Validate code samples in: {{#each files}}{{this.path}}{{/each}}';
        }
        return '';
      });

      const result = await performRecipesValidate({
        target: '/path/to/recipe-validation-error',
      });

      expect(result.context.target).toBe('/path/to/recipe-validation-error');
      expect(result.context.recipesValidated).toEqual([
        'recipe-validation-error',
      ]);

      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'success' &&
            msg.text.includes("Recipe 'recipe-validation-error' is valid")
        )
      ).toBe(true);

      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'warning' &&
            msg.text.includes('Code sample validation failed')
        )
      ).toBe(true);
    });

    it('should validate code samples for library validation', async () => {
      let callCount = 0;
      mockQuery.mockImplementation(async function* () {
        callCount++;
        if (callCount === 1) {
          yield {
            type: 'result',
            subtype: 'success',
            result: JSON.stringify({
              valid: true,
              violations: [],
              summary: {
                totalFiles: 1,
                filesWithViolations: 0,
                totalViolations: 0,
                violationTypes: {
                  generic_placeholder: 0,
                  incomplete_fragment: 0,
                  abstract_pseudocode: 0,
                  overly_simplistic: 0,
                },
              },
            }),
          };
        } else {
          yield {
            type: 'result',
            subtype: 'success',
            result: JSON.stringify({
              valid: false,
              violations: [
                {
                  file: 'fix.md',
                  line: 1,
                  type: 'overly_simplistic',
                  description: 'Code is too basic',
                  suggestion: 'Provide more detailed implementation',
                  codeSnippet: 'Fix content',
                },
              ],
              summary: {
                totalFiles: 1,
                filesWithViolations: 1,
                totalViolations: 1,
                violationTypes: {
                  generic_placeholder: 0,
                  incomplete_fragment: 0,
                  abstract_pseudocode: 0,
                  overly_simplistic: 1,
                },
              },
            }),
          };
        }
      });

      const recipesModule = await import('./recipes');
      const performRecipesValidate = recipesModule.performRecipesValidate;
      mockExistsSync.mockImplementation((filePath: string) => {
        if (filePath === '/path/to/test-library') {
          return true;
        }
        if (filePath === '/path/to/test-library/metadata.yaml') {
          return false;
        }
        if (
          filePath.includes('recipe-one') ||
          filePath.includes('recipe-two')
        ) {
          return true;
        }
        if (
          filePath.includes('metadata.yaml') ||
          filePath.includes('prompt.md') ||
          filePath.includes('fix.md')
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
        if (dirPath === '/path/to/test-library') {
          return ['recipe-one', 'recipe-two'];
        }
        if (dirPath.includes('recipe-one') && !dirPath.includes('.')) {
          return [];
        }
        if (dirPath.includes('recipe-two') && !dirPath.includes('.')) {
          return [];
        }
        return [];
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('recipe-one/metadata.yaml')) {
          return yamlStringify({
            id: 'recipe-one',
            category: 'test',
            summary: 'First recipe',
            level: 'workspace-preferred',
            ecosystems: [],
            provides: [],
            requires: [],
          });
        }
        if (filePath.includes('recipe-two/metadata.yaml')) {
          return yamlStringify({
            id: 'recipe-two',
            category: 'test',
            summary: 'Second recipe',
            level: 'workspace-preferred',
            ecosystems: [],
            provides: [],
            requires: [],
          });
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n## Investigation\nTest investigation\n## Expected Output\nTest output';
        }
        if (filePath.includes('fix.md')) {
          return 'Fix content';
        }
        if (filePath.includes('validation/code_sample_validation.md')) {
          return 'Validate code samples in: {{#each files}}{{this.path}}{{/each}}';
        }
        return '';
      });

      const result = await performRecipesValidate({
        target: '/path/to/test-library',
      });

      expect(result.context.target).toBe('/path/to/test-library');
      expect(result.context.recipesValidated).toEqual([
        'recipe-one',
        'recipe-two',
      ]);
      expect(result.summary).toBeDefined();
      expect(result.summary?.total).toBe(2);
      expect(result.summary?.valid).toBe(1);

      expect(
        result.messages.some(
          (msg) => msg.type === 'success' && msg.text === 'recipe-one'
        )
      ).toBe(true);
      expect(
        result.messages.some(
          (msg) => msg.type === 'error' && msg.text === 'recipe-two:'
        )
      ).toBe(true);

      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'warning' &&
            msg.text.includes('recipe-two code sample issues:')
        )
      ).toBe(true);

      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'warning' &&
            msg.text.includes('fix.md:1 (overly_simplistic)')
        )
      ).toBe(true);
    });

    it('should skip code sample validation for recipes with no fix files', async () => {
      const recipesModule = await import('./recipes');
      const performRecipesValidate = recipesModule.performRecipesValidate;
      mockExistsSync.mockImplementation((filePath: string) => {
        if (filePath === '/path/to/recipe-no-fixes') {
          return true;
        }
        if (filePath === '/path/to/recipe-no-fixes/metadata.yaml') {
          return true;
        }
        if (filePath === '/path/to/recipe-no-fixes/prompt.md') {
          return true;
        }
        if (filePath === '/path/to/recipe-no-fixes/fix.md') {
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
        if (filePath === '/path/to/recipe-no-fixes/metadata.yaml') {
          return yamlStringify({
            id: 'recipe-no-fixes',
            category: 'test',
            summary: 'Recipe with no fix content',
            level: 'workspace-preferred',
            ecosystems: [],
            provides: [],
            requires: [],
          });
        }
        if (filePath === '/path/to/recipe-no-fixes/prompt.md') {
          return '## Goal\nTest goal\n## Investigation\nTest investigation\n## Expected Output\nTest output';
        }
        if (filePath === '/path/to/recipe-no-fixes/fix.md') {
          return ''; // Empty fix file
        }
        if (filePath.includes('validation/code_sample_validation.md')) {
          return 'Validate code samples in: {{#each files}}{{this.path}}{{/each}}';
        }
        return '';
      });

      const result = await performRecipesValidate({
        target: '/path/to/recipe-no-fixes',
      });

      expect(result.context.target).toBe('/path/to/recipe-no-fixes');
      expect(result.context.recipesValidated).toEqual(['recipe-no-fixes']);

      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'success' &&
            msg.text.includes("Recipe 'recipe-no-fixes' is valid")
        )
      ).toBe(true);

      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'warning' && msg.text.includes('Code Sample Issues:')
        )
      ).toBe(false);
    });

    it('should handle malicious project paths and prevent path traversal attacks', async () => {
      const recipesModule = await import('./recipes');
      const performRecipesApply = recipesModule.performRecipesApply;

      mockExistsSync.mockImplementation((path) => {
        if (path === '/path/to/test-recipe') {
          return true;
        }
        if (path === '/path/to/test-recipe/metadata.yaml') {
          return true;
        }
        if (path === '/path/to/test-recipe/prompt.md') {
          return true;
        }
        if (path === '/path/to/test-recipe/fix.md') {
          return true;
        }
        if (path.includes('analysis.json')) {
          return true;
        }
        if (path.includes('.chorenzo')) {
          return true;
        }
        return false;
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify({
            id: 'test-recipe',
            category: 'test',
            summary: 'Test recipe',
            level: 'project-only',
            ecosystems: [],
            provides: [],
            requires: [],
          });
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n## Investigation\nTest investigation\n## Expected Output\nTest output';
        }
        if (filePath.includes('fix.md')) {
          return 'Test fix content';
        }
        if (filePath.includes('analysis.json')) {
          return JSON.stringify({
            workspaceEcosystem: 'typescript',
            projects: [
              { path: '../../../etc/passwd', ecosystem: 'typescript' },
            ],
          });
        }
        if (filePath.includes('.chorenzo/state.json')) {
          return JSON.stringify({ workspace: {}, projects: {} });
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to {{ project_path }}...';
        }
        return '';
      });

      await expect(
        performRecipesApply({
          recipe: '/path/to/test-recipe',
          project: '../../../etc/passwd',
        })
      ).rejects.toThrow(/Path traversal detected|Invalid project path/);
    });

    it('should handle corrupted state file JSON gracefully', async () => {
      const recipesModule = await import('./recipes');
      const performRecipesApply = recipesModule.performRecipesApply;

      mockExistsSync.mockImplementation((path) => {
        if (path === '/path/to/test-recipe') {
          return true;
        }
        if (path === '/path/to/test-recipe/metadata.yaml') {
          return true;
        }
        if (path === '/path/to/test-recipe/prompt.md') {
          return true;
        }
        if (path === '/path/to/test-recipe/fix.md') {
          return true;
        }
        if (path.includes('analysis.json')) {
          return true;
        }
        if (path.includes('.chorenzo')) {
          return true;
        }
        return false;
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('.chorenzo/state.json')) {
          return '{"workspace": invalid json}';
        }
        if (filePath.includes('metadata.yaml')) {
          return yamlStringify({
            id: 'test-recipe',
            category: 'test',
            summary: 'Test recipe',
            level: 'workspace-only',
            ecosystems: [],
            provides: [],
            requires: [],
          });
        }
        if (filePath.includes('prompt.md')) {
          return '## Goal\nTest goal\n## Investigation\nTest investigation\n## Expected Output\nTest output';
        }
        if (filePath.includes('fix.md')) {
          return 'Test fix content';
        }
        if (filePath.includes('analysis.json')) {
          return JSON.stringify({
            workspaceEcosystem: 'typescript',
            projects: [],
          });
        }
        if (filePath.includes('apply_recipe.md')) {
          return 'Apply the recipe {{ recipe_id }} to workspace...';
        }
        return '';
      });

      await expect(
        performRecipesApply({
          recipe: '/path/to/test-recipe',
        })
      ).rejects.toThrow();
    });
  });
});
