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
  mockExistsSync,
  mockQuery,
  mockReadFileSync,
  mockReaddirSync,
  mockStatSync,
  setupDefaultMocks,
  setupMultiLibraryRecipes,
} from './recipes.test-utils';

describe('Recipes Review Integration Tests', () => {
  let performRecipesReview: typeof import('./recipes.review').performRecipesReview;

  beforeEach(async () => {
    jest.clearAllMocks();
    setupDefaultMocks();

    const recipesReviewModule = await import('./recipes.review');
    performRecipesReview = recipesReviewModule.performRecipesReview;
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  describe('Input Type Detection and Basic Functionality', () => {
    it('should review recipe folder with AI validation', async () => {
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
        } else if (filePath.includes('validation/code_sample_validation.md')) {
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

      const mockProgress = jest.fn();
      const result = await performRecipesReview(options, mockProgress);

      expect(result.context.inputType).toBe('recipe-folder');
      expect(result.context.target).toBe('/path/to/recipe');
      expect(result.context.recipesReviewed).toEqual(['recipe']);
      expect(result.messages).toBeDefined();
      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'success' &&
            msg.text.includes("Recipe 'recipe' passed code sample review")
        )
      ).toBe(true);
      expect(mockProgress).toHaveBeenCalledWith(
        'Loading recipe from: /path/to/recipe'
      );
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should throw error when target parameter is missing', async () => {
      const options = { target: '' };

      await expect(performRecipesReview(options)).rejects.toThrow(
        'Target parameter is required for review'
      );
    });
  });

  describe('AI Code Sample Validation', () => {
    beforeEach(() => {
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
    });

    it('should detect and report code sample violations', async () => {
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

      const result = await performRecipesReview({
        target: '/path/to/recipe-with-violations',
      });

      expect(result.context.target).toBe('/path/to/recipe-with-violations');
      expect(result.context.recipesReviewed).toEqual([
        'recipe-with-violations',
      ]);
      expect(result.messages).toBeDefined();

      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'warning' && msg.text.includes('Code Sample Issues:')
        )
      ).toBe(true);

      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'warning' &&
            msg.text.includes(
              'fix.md:2 (generic_placeholder): Uses generic placeholder YOUR_API_KEY'
            )
        )
      ).toBe(true);

      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'warning' &&
            msg.text.includes(
              'fix.md:3 (incomplete_fragment): Contains TODO comment'
            )
        )
      ).toBe(true);
    });

    it('should handle AI validation failures gracefully', async () => {
      mockExistsSync.mockImplementation((filePath: string) => {
        return (
          filePath === '/path/to/recipe-validation-error' ||
          filePath === '/path/to/recipe-validation-error/metadata.yaml' ||
          filePath === '/path/to/recipe-validation-error/prompt.md' ||
          filePath === '/path/to/recipe-validation-error/fix.md'
        );
      });

      mockStatSync.mockImplementation(
        (filePath: string) =>
          ({
            isDirectory: () => filePath === '/path/to/recipe-validation-error',
            isFile: () =>
              filePath === '/path/to/recipe-validation-error/metadata.yaml',
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

      mockQuery.mockImplementation(function* () {
        yield {
          type: 'result',
          subtype: 'error_api_response',
          error: 'AI review failed',
        };
      });

      const result = await performRecipesReview({
        target: '/path/to/recipe-validation-error',
      });

      expect(result.context.target).toBe('/path/to/recipe-validation-error');
      expect(result.context.recipesReviewed).toEqual([
        'recipe-validation-error',
      ]);

      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'warning' && msg.text.includes('AI review failed for')
        )
      ).toBe(true);
    });

    it('should skip review for recipes with no fix files', async () => {
      mockExistsSync.mockImplementation((filePath: string) => {
        return (
          filePath === '/path/to/recipe-no-fixes' ||
          filePath === '/path/to/recipe-no-fixes/metadata.yaml' ||
          filePath === '/path/to/recipe-no-fixes/prompt.md' ||
          filePath === '/path/to/recipe-no-fixes/fix.md'
        );
      });

      mockStatSync.mockImplementation(
        (filePath: string) =>
          ({
            isDirectory: () => filePath === '/path/to/recipe-no-fixes',
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
          return '   \n  \n   ';
        }
        return '';
      });

      const result = await performRecipesReview({
        target: '/path/to/recipe-no-fixes',
      });

      expect(result.context.target).toBe('/path/to/recipe-no-fixes');
      expect(result.context.recipesReviewed).toEqual(['recipe-no-fixes']);

      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'success' &&
            msg.text.includes(
              "Recipe 'recipe-no-fixes' passed code sample review"
            )
        )
      ).toBe(true);

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should review entire library with mixed results', async () => {
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

      const result = await performRecipesReview({
        target: '/path/to/test-library',
      });

      expect(result.context.target).toBe('/path/to/test-library');
      expect(result.context.recipesReviewed).toEqual([
        'recipe-one',
        'recipe-two',
      ]);
      expect(result.summary).toBeDefined();
      expect(result.summary?.total).toBe(2);
      expect(result.summary?.passed).toBe(1);
      expect(result.summary?.failed).toBe(1);

      expect(
        result.messages.some(
          (msg) => msg.type === 'success' && msg.text === 'recipe-one'
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

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should handle empty library directory', async () => {
      mockExistsSync.mockImplementation((filePath: string) => {
        if (filePath === '/path/to/empty-library') {
          return true;
        }
        if (filePath === '/path/to/empty-library/metadata.yaml') {
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

      mockReaddirSync.mockImplementation((dirPath: string) => {
        if (dirPath === '/path/to/empty-library') {
          return [];
        }
        return [];
      });

      await expect(
        performRecipesReview({
          target: '/path/to/empty-library',
        })
      ).rejects.toThrow('No recipes found in library');
    });

    it('should handle library with parsing failures', async () => {
      mockExistsSync.mockImplementation((filePath: string) => {
        if (filePath === '/path/to/broken-library') {
          return true;
        }
        if (filePath === '/path/to/broken-library/metadata.yaml') {
          return false;
        }
        if (filePath.includes('broken-recipe')) {
          return true;
        }
        if (filePath.includes('metadata.yaml')) {
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
        if (dirPath === '/path/to/broken-library') {
          return ['broken-recipe'];
        }
        return [];
      });

      mockReadFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('broken-recipe/metadata.yaml')) {
          return 'invalid: yaml: content: [unclosed';
        }
        return '';
      });

      const result = await performRecipesReview({
        target: '/path/to/broken-library',
      });

      expect(result.context.target).toBe('/path/to/broken-library');
      expect(result.context.recipesReviewed).toEqual([]);
      expect(result.summary).toBeDefined();
      expect(result.summary?.total).toBe(1);
      expect(result.summary?.failed).toBe(1);

      expect(
        result.messages.some(
          (msg) =>
            msg.type === 'error' && msg.text.includes('Failed to parse recipe')
        )
      ).toBe(true);
    });

    it('should handle git URL input type', async () => {
      const options = { target: 'https://github.com/user/recipes.git' };

      mockExistsSync.mockImplementation((filePath: string) => {
        if (filePath.includes('/tmp/test-temp-')) {
          return true;
        }
        return false;
      });

      mockStatSync.mockImplementation(
        (filePath: string) =>
          ({
            isDirectory: () => filePath.includes('/tmp/test-temp-'),
            isFile: () => false,
          }) as fs.Stats
      );

      mockReaddirSync.mockImplementation((dirPath: string) => {
        if (dirPath.includes('/tmp/test-temp-')) {
          return [];
        }
        return [];
      });

      const mockProgress = jest.fn();
      await expect(performRecipesReview(options, mockProgress)).rejects.toThrow(
        'No recipes found in library'
      );

      expect(mockProgress).toHaveBeenCalledWith(
        'Cloning repository: https://github.com/user/recipes.git'
      );
    });
  });

  describe('Library and Error Handling', () => {
    it('should review recipe by name from library', async () => {
      const options = { target: 'test-recipe' };

      setupMultiLibraryRecipes({
        core: {
          testing: {
            'test-recipe': {
              recipeId: 'test-recipe',
              category: 'testing',
              provides: ['test-feature'],
              requires: [],
            },
          },
        },
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

      const mockProgress = jest.fn();
      const result = await performRecipesReview(options, mockProgress);

      expect(result.context.inputType).toBe('recipe-name');
      expect(result.context.target).toBe('test-recipe');
      expect(result.context.recipesReviewed).toEqual(['test-recipe']);
      expect(result.messages.some((msg) => msg.type === 'success')).toBe(true);
      expect(mockProgress).toHaveBeenCalledWith(
        'Searching for recipe: test-recipe'
      );
    });

    it('should handle recipe not found by name', async () => {
      const options = { target: 'nonexistent-recipe' };

      setupMultiLibraryRecipes({
        core: {
          testing: {
            'other-recipe': {
              recipeId: 'other-recipe',
              category: 'testing',
              provides: [],
              requires: [],
            },
          },
        },
      });

      await expect(performRecipesReview(options)).rejects.toThrow(
        "Recipe 'nonexistent-recipe' not found in"
      );
    });
  });
});
