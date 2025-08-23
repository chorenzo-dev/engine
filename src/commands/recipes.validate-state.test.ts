import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { stringify as yamlStringify } from 'yaml';

import { setupFixture } from '~/test-utils/fixture-loader';

import {
  createLibraryConfig,
  createMockYamlData,
  mockExistsSync,
  mockReadFileSync,
  setupDefaultMocks,
} from './recipes.test-utils';

describe('Recipes Validate State Command Integration Tests', () => {
  let recipesValidateState: typeof import('./recipes.validate-state').recipesValidateState;

  beforeEach(async () => {
    jest.clearAllMocks();
    setupDefaultMocks();

    recipesValidateState = (await import('./recipes.validate-state'))
      .recipesValidateState;
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('should validate recipe state when all provides are present', async () => {
    setupFixture('simple-express', { addGitRepo: true });

    const mockYamlData = createMockYamlData({
      recipeId: 'test-recipe',
      provides: ['test-recipe.configured'],
    });
    (mockYamlData.config.libraries as Record<string, unknown>)['test-recipe'] =
      createLibraryConfig('test-recipe');

    mockExistsSync.mockImplementation((filePath) => {
      if (filePath.includes('state.json')) {
        return true;
      }
      if (filePath.includes('config.yaml')) {
        return true;
      }
      if (filePath.includes('test-recipe')) {
        return true;
      }
      return true;
    });

    mockReadFileSync.mockImplementation((filePath) => {
      if (filePath.includes('state.json')) {
        return JSON.stringify({
          workspace: {
            'test-recipe.configured': true,
          },
        });
      }
      if (filePath.includes('config.yaml')) {
        return yamlStringify(mockYamlData.config);
      }
      if (filePath.includes('metadata.yaml')) {
        return yamlStringify(mockYamlData.metadata);
      }
      return '';
    });

    const messages: string[] = [];
    const onProgress = (message: string) => messages.push(message);

    await expect(
      recipesValidateState({ recipe: 'test-recipe' }, onProgress)
    ).resolves.toBeUndefined();

    expect(messages.some((msg) => msg.includes('Recipe state is valid'))).toBe(
      true
    );
  });

  it('should fail validation when provides are missing from state', async () => {
    setupFixture('simple-express', { addGitRepo: true });

    const mockYamlData = createMockYamlData({
      recipeId: 'test-recipe',
      provides: ['test-recipe.configured'],
    });
    (mockYamlData.config.libraries as Record<string, unknown>)['test-recipe'] =
      createLibraryConfig('test-recipe');

    mockExistsSync.mockImplementation((filePath) => {
      if (filePath.includes('state.json')) {
        return true;
      }
      if (filePath.includes('config.yaml')) {
        return true;
      }
      if (filePath.includes('test-recipe')) {
        return true;
      }
      return true;
    });

    mockReadFileSync.mockImplementation((filePath) => {
      if (filePath.includes('state.json')) {
        return JSON.stringify({
          workspace: {},
        });
      }
      if (filePath.includes('config.yaml')) {
        return yamlStringify(mockYamlData.config);
      }
      if (filePath.includes('metadata.yaml')) {
        return yamlStringify(mockYamlData.metadata);
      }
      return '';
    });

    const messages: string[] = [];
    const onProgress = (message: string) => messages.push(message);

    await expect(
      recipesValidateState({ recipe: 'test-recipe' }, onProgress)
    ).rejects.toThrow('Missing provides');

    expect(
      messages.some((msg) => msg.includes('Recipe state validation failed'))
    ).toBe(true);
  });

  it('should pass validation when recipe has no provides', async () => {
    setupFixture('simple-express', { addGitRepo: true });

    const mockYamlData = createMockYamlData({
      recipeId: 'test-recipe',
      provides: [],
    });
    (mockYamlData.config.libraries as Record<string, unknown>)['test-recipe'] =
      createLibraryConfig('test-recipe');

    mockExistsSync.mockImplementation((filePath) => {
      if (filePath.includes('config.yaml')) {
        return true;
      }
      if (filePath.includes('test-recipe')) {
        return true;
      }
      return true;
    });

    mockReadFileSync.mockImplementation((filePath) => {
      if (filePath.includes('config.yaml')) {
        return yamlStringify(mockYamlData.config);
      }
      if (filePath.includes('metadata.yaml')) {
        return yamlStringify(mockYamlData.metadata);
      }
      return '';
    });

    const messages: string[] = [];
    const onProgress = (message: string) => messages.push(message);

    await expect(
      recipesValidateState({ recipe: 'test-recipe' }, onProgress)
    ).resolves.toBeUndefined();

    expect(
      messages.some((msg) => msg.includes('Recipe has no provides to validate'))
    ).toBe(true);
  });

  it('should fail gracefully when recipe cannot be loaded', async () => {
    setupFixture('simple-express', { addGitRepo: true });

    const mockYamlData = createMockYamlData({});

    mockExistsSync.mockImplementation((filePath) => {
      if (filePath.includes('config.yaml')) {
        return true;
      }
      return false;
    });

    mockReadFileSync.mockImplementation((filePath) => {
      if (filePath.includes('config.yaml')) {
        return yamlStringify(mockYamlData.config);
      }
      return '';
    });

    const messages: string[] = [];
    const onProgress = (message: string) => messages.push(message);

    await expect(
      recipesValidateState({ recipe: 'nonexistent-recipe' }, onProgress)
    ).rejects.toThrow('Failed to load recipe');

    expect(messages.some((msg) => msg.includes('Failed to load recipe'))).toBe(
      true
    );
  });
});
