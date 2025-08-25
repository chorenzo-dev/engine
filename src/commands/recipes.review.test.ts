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
          result: `# Recipe Review: recipe

## Status: PASS

## Summary
- Files reviewed: 1
- Issues found: 0
- Violations: None

## Key Findings
Recipe 'recipe' passed code sample review with no violations found.

## Report Details
Detailed analysis saved to: \`./.chorenzo/reviews/recipe.json\``,
        };
      });

      const mockProgress = jest.fn();
      const result = await performRecipesReview(options, mockProgress);

      expect(result.context.inputType).toBe('recipe-folder');
      expect(result.context.target).toBe('/path/to/recipe');
      expect(result.context.recipesReviewed).toEqual(['recipe']);
      expect(result.report).toBeDefined();
      expect(result.report).toContain('Recipe Review: recipe');
      expect(result.report).toContain('Status: PASS');
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

    it('should throw error for library input (not supported)', async () => {
      const options = { target: '/path/to/library' };

      mockExistsSync.mockImplementation((filePath: string) => {
        if (filePath === '/path/to/library') {
          return true;
        }
        if (filePath === '/path/to/library/metadata.yaml') {
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

      await expect(performRecipesReview(options)).rejects.toThrow(
        'Library review is not supported. Please specify a specific recipe name or path.'
      );
    });

    it('should throw error for git URL input (not supported)', async () => {
      const options = { target: 'https://github.com/user/recipes.git' };

      await expect(performRecipesReview(options)).rejects.toThrow(
        'Git repository review is not supported. Please specify a specific recipe name or path.'
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
          result: `# Recipe Review: recipe-with-violations

## Status: FAIL

## Summary
- Files reviewed: 1
- Issues found: 2
- Violations: generic_placeholder (1), incomplete_fragment (1)

## Key Findings
Code Sample Issues:
- fix.md:2 (generic_placeholder): Uses generic placeholder YOUR_API_KEY
- fix.md:3 (incomplete_fragment): Contains TODO comment

## Report Details
Detailed analysis saved to: \`./.chorenzo/reviews/recipe-with-violations.json\``,
        };
      });

      const result = await performRecipesReview({
        target: '/path/to/recipe-with-violations',
      });

      expect(result.context.target).toBe('/path/to/recipe-with-violations');
      expect(result.context.recipesReviewed).toEqual([
        'recipe-with-violations',
      ]);
      expect(result.report).toBeDefined();
      expect(result.report).toContain('Recipe Review: recipe-with-violations');
      expect(result.report).toContain('Status: FAIL');
      expect(result.report).toContain('Code Sample Issues:');
      expect(result.report).toContain(
        'fix.md:2 (generic_placeholder): Uses generic placeholder YOUR_API_KEY'
      );
      expect(result.report).toContain(
        'fix.md:3 (incomplete_fragment): Contains TODO comment'
      );
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

      await expect(
        performRecipesReview({
          target: '/path/to/recipe-validation-error',
        })
      ).rejects.toThrow(
        "Review failed for 'recipe-validation-error': Code sample review failed: AI review failed: AI review failed: AI review failed: AI review failed"
      );
    });

    it('should generate review for recipes with no fix files', async () => {
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
        if (filePath.includes('validation/code_sample_validation.md')) {
          return 'Validate code samples in: {{#each files}}{{this.path}}{{/each}}';
        }
        return '';
      });

      mockQuery.mockImplementation(function* () {
        yield {
          type: 'result',
          subtype: 'success',
          result: `# Recipe Review: recipe-no-fixes

## Status: PASS

## Summary
- Files reviewed: 0
- Issues found: 0
- Violations: None

## Key Findings
Recipe 'recipe-no-fixes' passed code sample review. No fix files found with content to validate.

## Report Details
Detailed analysis saved to: \`./.chorenzo/reviews/recipe-no-fixes.json\``,
        };
      });

      const result = await performRecipesReview({
        target: '/path/to/recipe-no-fixes',
      });

      expect(result.context.target).toBe('/path/to/recipe-no-fixes');
      expect(result.context.recipesReviewed).toEqual(['recipe-no-fixes']);
      expect(result.report).toBeDefined();
      expect(result.report).toContain('Recipe Review: recipe-no-fixes');
      expect(result.report).toContain('Status: PASS');
      expect(result.report).toContain(
        'No fix files found with content to validate'
      );

      expect(mockQuery).toHaveBeenCalled();
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
          result: `# Recipe Review: test-recipe

## Status: PASS

## Summary
- Files reviewed: 1
- Issues found: 0
- Violations: None

## Key Findings
Recipe 'test-recipe' passed code sample review with no violations found.

## Report Details
Detailed analysis saved to: \`./.chorenzo/reviews/test-recipe.json\``,
        };
      });

      const mockProgress = jest.fn();
      const result = await performRecipesReview(options, mockProgress);

      expect(result.context.inputType).toBe('recipe-name');
      expect(result.context.target).toBe('test-recipe');
      expect(result.context.recipesReviewed).toEqual(['test-recipe']);
      expect(result.report).toBeDefined();
      expect(result.report).toContain('Recipe Review: test-recipe');
      expect(result.report).toContain('Status: PASS');
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
