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
  createMockYamlData,
  mockExistsSync,
  mockQuery,
  mockReadFileSync,
  mockReaddirSync,
  mockStatSync,
  setupDefaultMocks,
  setupRecipeExistenceChecks,
} from './recipes.test-utils';

describe('Recipes Validation Tests', () => {
  let performRecipesValidate: typeof import('./recipes.validate').performRecipesValidate;

  beforeEach(async () => {
    jest.clearAllMocks();
    setupDefaultMocks();

    const recipesValidateModule = await import('./recipes.validate');
    performRecipesValidate = recipesValidateModule.performRecipesValidate;
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  describe('Input Type Detection', () => {
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
                filePath ===
                  '/test/home/.chorenzo/recipes/lib1/nested-recipe' ||
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

  describe('Code Sample Validation Integration', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      setupDefaultMocks();
    });

    it('should run code sample validation during recipe validation and handle failures gracefully', async () => {
      const recipesValidateModule = await import('./recipes.validate');
      const performRecipesValidate =
        recipesValidateModule.performRecipesValidate;
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

      mockQuery.mockImplementation(function* () {
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
      const recipesValidateModule = await import('./recipes.validate');
      const performRecipesValidate =
        recipesValidateModule.performRecipesValidate;
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

      mockQuery.mockImplementation(function* () {
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
      const recipesValidateModule = await import('./recipes.validate');
      const performRecipesValidate =
        recipesValidateModule.performRecipesValidate;
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
      mockQuery.mockImplementation(function* () {
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

      const recipesValidateModule = await import('./recipes.validate');
      const performRecipesValidate =
        recipesValidateModule.performRecipesValidate;
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
      const recipesValidateModule = await import('./recipes.validate');
      const performRecipesValidate =
        recipesValidateModule.performRecipesValidate;
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
      const recipesModule = await import('./recipes.apply');
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
            workspaceEcosystem: 'javascript',
            projects: [
              { path: '../../../etc/passwd', ecosystem: 'javascript' },
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
      const recipesModule = await import('./recipes.apply');
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
            workspaceEcosystem: 'javascript',
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
