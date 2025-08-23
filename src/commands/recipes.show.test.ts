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
  mockGitStatus,
  mockReadFileSync,
  mockReaddirSync,
  mockStatSync,
  setupDefaultMocks,
} from './recipes.test-utils';

describe('Recipes Show Command Integration', () => {
  let loadRecipeForShow: typeof import('./recipes.show').loadRecipeForShow;

  beforeEach(async () => {
    jest.clearAllMocks();
    setupDefaultMocks();

    const recipesShowModule = await import('./recipes.show');
    loadRecipeForShow = recipesShowModule.loadRecipeForShow;
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  const setupShowMocks = (options: {
    recipeName: string;
    isLocal?: boolean;
    isRemote?: boolean;
    libraryName?: string;
    repoUrl?: string;
    ref?: string;
    recipePath?: string;
  }) => {
    const {
      recipeName,
      isLocal = false,
      isRemote = false,
      libraryName = 'test-library',
      repoUrl = 'https://github.com/test/test-recipes.git',
      ref = 'main',
      recipePath = recipeName,
    } = options;

    const recipeBasePath = isLocal
      ? `/local/recipes/${recipeName}`
      : `/test/home/.chorenzo/recipes/${libraryName}/${recipePath}`;

    setupDefaultMocks();

    const mockYamlData = createMockYamlData({
      recipeId: recipeName,
      category: 'test',
      level: 'project-only',
    });

    if (isRemote && libraryName) {
      (mockYamlData.config.libraries as Record<string, unknown>)[libraryName] =
        {
          repo: repoUrl,
          ref,
        };
    }

    mockExistsSync.mockImplementation((path) => {
      if (path === recipeBasePath) {
        return true;
      }
      if (path === `${recipeBasePath}/metadata.yaml`) {
        return true;
      }
      if (path === `${recipeBasePath}/prompt.md`) {
        return true;
      }
      if (path === `${recipeBasePath}/fix.md`) {
        return true;
      }
      if (path.includes('/.chorenzo/config.yaml')) {
        return true;
      }
      if (path.includes('/.chorenzo/recipes')) {
        return true;
      }
      if (path.includes(`recipes/${libraryName}`)) {
        return true;
      }
      return false;
    });

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('config.yaml')) {
        return yamlStringify(mockYamlData.config);
      }
      if (filePath.includes('metadata.yaml')) {
        return yamlStringify({
          id: recipeName,
          category: 'test',
          summary: `Test recipe ${recipeName}`,
          level: 'project-only',
          ecosystems: [],
          provides: ['test-functionality'],
          requires: [],
        });
      }
      if (filePath.includes('prompt.md')) {
        return `## Goal\nTest goal for ${recipeName}\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output`;
      }
      if (filePath.includes('fix.md')) {
        return `Fix content for ${recipeName}`;
      }
      return '';
    });

    mockReaddirSync.mockImplementation((path) => {
      if (path === '/test/home/.chorenzo/recipes') {
        return isRemote ? [libraryName] : [];
      }
      if (
        path.includes(`recipes/${libraryName}`) &&
        !path.includes(recipeName)
      ) {
        return [recipeName];
      }
      return [];
    });

    mockStatSync.mockImplementation(
      (path) =>
        ({
          isDirectory: () => {
            if (path === '/test/home/.chorenzo/recipes') {
              return true;
            }
            if (path === `/test/home/.chorenzo/recipes/${libraryName}`) {
              return true;
            }
            if (path === recipeBasePath) {
              return true;
            }
            return false;
          },
          isFile: () => path.includes('.yaml') || path.includes('.md'),
        }) as fs.Stats
    );
  };

  it('should load recipe by name from library', async () => {
    setupShowMocks({
      recipeName: 'test-recipe',
      isRemote: true,
      libraryName: 'test-library',
      repoUrl: 'https://github.com/test/test-recipes.git',
      ref: 'main',
    });

    mockGitStatus.mockResolvedValue({
      files: [],
      ahead: 0,
      behind: 0,
      current: 'main',
      tracking: 'origin/main',
    });

    const result = await loadRecipeForShow('test-recipe');

    expect(result.recipe.getId()).toBe('test-recipe');
    expect(result.recipe.getCategory()).toBe('test');
    expect(result.recipe.getSummary()).toBe('Test recipe test-recipe');
    expect(result.localPath).toBe(
      '/test/home/.chorenzo/recipes/test-library/test-recipe'
    );
    expect(result.isRemote).toBe(true);
    expect(result.webUrl).toBe(
      'https://github.com/test/test-recipes/tree/main/test-recipe'
    );
    expect(mockGitStatus).toHaveBeenCalled();
  });

  it('should load recipe by local folder path', async () => {
    setupShowMocks({
      recipeName: 'local-recipe',
      isLocal: true,
    });

    const result = await loadRecipeForShow('/local/recipes/local-recipe');

    expect(result.recipe.getId()).toBe('local-recipe');
    expect(result.recipe.getCategory()).toBe('test');
    expect(result.recipe.getSummary()).toBe('Test recipe local-recipe');
    expect(result.localPath).toBe('/local/recipes/local-recipe');
    expect(result.isRemote).toBe(false);
    expect(result.webUrl).toBeUndefined();
  });

  it('should throw error when recipe not found', async () => {
    mockExistsSync.mockImplementation(() => false);
    mockReaddirSync.mockImplementation(() => []);

    await expect(loadRecipeForShow('nonexistent-recipe')).rejects.toThrow(
      "Recipe 'nonexistent-recipe' not found"
    );
  });

  it('should generate web URL for remote recipe from GitHub library', async () => {
    setupShowMocks({
      recipeName: 'github-recipe',
      isRemote: true,
      libraryName: 'github-library',
      repoUrl: 'https://github.com/user/recipes.git',
      ref: 'v2.1',
      recipePath: 'advanced/github-recipe',
    });

    mockReaddirSync.mockImplementation((path) => {
      if (path === '/test/home/.chorenzo/recipes') {
        return ['github-library'];
      }
      if (
        path.includes('recipes/github-library') &&
        path.includes('advanced')
      ) {
        return ['github-recipe'];
      }
      if (
        path.includes('recipes/github-library') &&
        !path.includes('advanced')
      ) {
        return ['advanced'];
      }
      return [];
    });

    const recipeBasePath =
      '/test/home/.chorenzo/recipes/github-library/advanced/github-recipe';

    mockStatSync.mockImplementation(
      (path) =>
        ({
          isDirectory: () => {
            if (path === '/test/home/.chorenzo/recipes') {
              return true;
            }
            if (path === '/test/home/.chorenzo/recipes/github-library') {
              return true;
            }
            if (
              path === '/test/home/.chorenzo/recipes/github-library/advanced'
            ) {
              return true;
            }
            if (path === recipeBasePath) {
              return true;
            }
            return false;
          },
          isFile: () => path.includes('.yaml') || path.includes('.md'),
        }) as fs.Stats
    );

    mockExistsSync.mockImplementation((path) => {
      if (path === recipeBasePath) {
        return true;
      }
      if (path === `${recipeBasePath}/metadata.yaml`) {
        return true;
      }
      if (path === `${recipeBasePath}/prompt.md`) {
        return true;
      }
      if (path === `${recipeBasePath}/fix.md`) {
        return true;
      }
      if (path.includes('/.chorenzo/config.yaml')) {
        return true;
      }
      if (path.includes('/.chorenzo/recipes')) {
        return true;
      }
      if (path.includes('recipes/github-library')) {
        return true;
      }
      if (path.includes('libraries/github-library/advanced')) {
        return true;
      }
      return false;
    });

    const result = await loadRecipeForShow('github-recipe');

    expect(result.recipe.getId()).toBe('github-recipe');
    expect(result.localPath).toBe(recipeBasePath);
    expect(result.isRemote).toBe(true);
    expect(result.webUrl).toBe(
      'https://github.com/user/recipes/tree/v2.1/advanced/github-recipe'
    );
  });

  it('should handle recipe without GitHub URL in remote library', async () => {
    setupShowMocks({
      recipeName: 'non-github-recipe',
      isRemote: true,
      libraryName: 'custom-library',
      repoUrl: 'https://gitlab.com/user/recipes.git',
    });

    const result = await loadRecipeForShow('non-github-recipe');

    expect(result.recipe.getId()).toBe('non-github-recipe');
    expect(result.isRemote).toBe(true);
    expect(result.webUrl).toBeUndefined();
  });

  it('should handle recipe in remote library without repo configuration', async () => {
    setupDefaultMocks();

    const mockYamlData = createMockYamlData({
      recipeId: 'no-repo-recipe',
      category: 'test',
      level: 'project-only',
    });

    (mockYamlData.config.libraries as Record<string, unknown>)['test-library'] =
      {
        ref: 'main',
      };

    const recipeBasePath =
      '/test/home/.chorenzo/recipes/test-library/no-repo-recipe';

    mockExistsSync.mockImplementation((path) => {
      if (path === recipeBasePath) {
        return true;
      }
      if (path === `${recipeBasePath}/metadata.yaml`) {
        return true;
      }
      if (path === `${recipeBasePath}/prompt.md`) {
        return true;
      }
      if (path === `${recipeBasePath}/fix.md`) {
        return true;
      }
      if (path.includes('/.chorenzo/config.yaml')) {
        return true;
      }
      if (path.includes('/.chorenzo/recipes')) {
        return true;
      }
      if (path.includes('recipes/test-library')) {
        return true;
      }
      return false;
    });

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('config.yaml')) {
        return yamlStringify(mockYamlData.config);
      }
      if (filePath.includes('metadata.yaml')) {
        return yamlStringify({
          id: 'no-repo-recipe',
          category: 'test',
          summary: 'Test recipe no-repo-recipe',
          level: 'project-only',
          ecosystems: [],
          provides: ['test-functionality'],
          requires: [],
        });
      }
      if (filePath.includes('prompt.md')) {
        return '## Goal\nTest goal for no-repo-recipe\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
      }
      if (filePath.includes('fix.md')) {
        return 'Fix content for no-repo-recipe';
      }
      return '';
    });

    mockReaddirSync.mockImplementation((path) => {
      if (path === '/test/home/.chorenzo/recipes') {
        return ['test-library'];
      }
      if (
        path.includes('recipes/test-library') &&
        !path.includes('no-repo-recipe')
      ) {
        return ['no-repo-recipe'];
      }
      return [];
    });

    mockStatSync.mockImplementation(
      (path) =>
        ({
          isDirectory: () => {
            if (path === '/test/home/.chorenzo/recipes') {
              return true;
            }
            if (path === '/test/home/.chorenzo/recipes/test-library') {
              return true;
            }
            if (path === recipeBasePath) {
              return true;
            }
            return false;
          },
          isFile: () => path.includes('.yaml') || path.includes('.md'),
        }) as fs.Stats
    );

    const result = await loadRecipeForShow('no-repo-recipe');

    expect(result.recipe.getId()).toBe('no-repo-recipe');
    expect(result.isRemote).toBe(true);
    expect(result.webUrl).toBeUndefined();
  });

  it('should preserve local changes and skip git refresh when files are modified', async () => {
    setupShowMocks({
      recipeName: 'local-changes-recipe',
      isRemote: true,
      libraryName: 'test-library',
      repoUrl: 'https://github.com/test/test-recipes.git',
      ref: 'main',
    });

    mockGitStatus.mockResolvedValue({
      files: [{ path: 'metadata.yaml', working_dir: 'M' }],
      ahead: 0,
      behind: 0,
      current: 'main',
      tracking: 'origin/main',
    });

    const result = await loadRecipeForShow('local-changes-recipe');

    expect(result.recipe.getId()).toBe('local-changes-recipe');
    expect(result.isRemote).toBe(true);
    expect(mockGitStatus).toHaveBeenCalled();
  });
});
