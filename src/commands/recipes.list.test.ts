import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

import {
  setupDefaultMocks,
  setupMultiLibraryRecipes,
} from './recipes.test-utils';

describe('Recipes List Command Integration', () => {
  let getRecipeCategories: typeof import('./recipes.list').getRecipeCategories;
  let getRecipesByCategory: typeof import('./recipes.list').getRecipesByCategory;

  beforeEach(async () => {
    jest.clearAllMocks();
    setupDefaultMocks();

    const recipesListModule = await import('./recipes.list');
    getRecipeCategories = recipesListModule.getRecipeCategories;
    getRecipesByCategory = recipesListModule.getRecipesByCategory;
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('should discover categories from multiple libraries with recipes', async () => {
    setupDefaultMocks();

    setupMultiLibraryRecipes({
      core: {
        automation: {
          'ci-pipeline': { recipeId: 'ci-pipeline', category: 'automation' },
        },
        testing: {
          'jest-runner': { recipeId: 'jest-runner', category: 'testing' },
        },
      },
      typescript: {
        build: {
          'webpack-config': { recipeId: 'webpack-config', category: 'build' },
        },
        linting: {
          'eslint-setup': { recipeId: 'eslint-setup', category: 'linting' },
        },
      },
    });

    const categories = await getRecipeCategories();
    expect(categories).toEqual(['automation', 'build', 'linting', 'testing']);
  });

  it('should find recipes by category across multiple libraries', async () => {
    setupDefaultMocks();

    setupMultiLibraryRecipes({
      core: {
        automation: {
          'ci-pipeline': { recipeId: 'ci-pipeline', category: 'automation' },
        },
      },
      typescript: {
        automation: {
          'lint-setup': { recipeId: 'lint-setup', category: 'automation' },
        },
      },
    });

    const recipes = await getRecipesByCategory('automation');
    expect(recipes).toHaveLength(2);
    expect(recipes[0]?.getId()).toBe('ci-pipeline');
    expect(recipes[1]?.getId()).toBe('lint-setup');
    expect(recipes[0]?.getCategory()).toBe('automation');
    expect(recipes[1]?.getCategory()).toBe('automation');
  });

  it('should aggregate categories from libraries with overlapping categories', async () => {
    setupDefaultMocks();

    setupMultiLibraryRecipes({
      core: {
        automation: {
          'ci-runner': { recipeId: 'ci-runner', category: 'automation' },
        },
        testing: {
          'jest-config': { recipeId: 'jest-config', category: 'testing' },
        },
      },
      typescript: {
        build: {
          'vite-setup': { recipeId: 'vite-setup', category: 'build' },
        },
        testing: {
          'vitest-config': { recipeId: 'vitest-config', category: 'testing' },
        },
      },
    });

    const categories = await getRecipeCategories();
    expect(categories).toEqual(['automation', 'build', 'testing']);

    const testingRecipes = await getRecipesByCategory('testing');
    expect(testingRecipes).toHaveLength(2);
    expect(testingRecipes[0]?.getId()).toBe('jest-config');
    expect(testingRecipes[1]?.getId()).toBe('vitest-config');
    expect(testingRecipes[0]?.getCategory()).toBe('testing');
    expect(testingRecipes[1]?.getCategory()).toBe('testing');
  });

  it('should return empty array for non-existent category', async () => {
    setupDefaultMocks();

    setupMultiLibraryRecipes({
      core: {
        automation: {
          'ci-deploy': { recipeId: 'ci-deploy', category: 'automation' },
        },
        testing: {
          'unit-runner': { recipeId: 'unit-runner', category: 'testing' },
        },
      },
      typescript: {
        build: {
          'rollup-config': { recipeId: 'rollup-config', category: 'build' },
        },
      },
    });

    const recipes = await getRecipesByCategory('non-existent-category');
    expect(recipes).toEqual([]);
  });
});
