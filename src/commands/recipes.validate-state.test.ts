import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { stringify as yamlStringify } from 'yaml';

import { icons } from '~/styles/icons';

import {
  mockReadFileSync,
  setupDefaultMocks,
  setupMultiLibraryRecipes,
} from './recipes.test-utils';

describe('Recipes Validate State Command Integration Tests', () => {
  let recipesValidateState: typeof import('./recipes.validate-state').recipesValidateState;

  beforeEach(async () => {
    jest.clearAllMocks();
    setupDefaultMocks();

    const recipesValidateStateModule = await import('./recipes.validate-state');
    recipesValidateState = recipesValidateStateModule.recipesValidateState;
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('should validate successfully when all workspace provides are present', async () => {
    const recipeData = {
      id: 'workspace-recipe',
      category: 'testing',
      summary: 'Test workspace recipe',
      level: 'workspace-only',
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
      provides: ['workspace.configured', 'workspace.feature.enabled'],
      requires: [],
    };

    setupMultiLibraryRecipes({
      'test-library': {
        testing: {
          'workspace-recipe': {
            recipeId: 'workspace-recipe',
            category: 'testing',
            level: 'workspace-only',
            provides: ['workspace.configured', 'workspace.feature.enabled'],
            requires: [],
          },
        },
      },
    });

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('state.json')) {
        return JSON.stringify({
          workspace: {
            'workspace.configured': true,
            'workspace.feature.enabled': true,
          },
          projects: {},
        });
      }
      if (filePath.includes('config.yaml')) {
        return yamlStringify({
          libraries: {
            'test-library': {
              repo: 'https://github.com/test/test-library.git',
              ref: 'main',
            },
          },
        });
      }
      if (
        filePath.includes(
          '/test-library/testing/workspace-recipe/metadata.yaml'
        )
      ) {
        return yamlStringify(recipeData);
      }
      if (filePath.includes('prompt.md')) {
        return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
      }
      if (
        filePath.includes('fix.md') ||
        filePath.includes('variants/basic.md')
      ) {
        return 'Basic fix prompt content';
      }
      if (filePath.includes('.json')) {
        return '{}';
      }
      return '';
    });

    const messages: string[] = [];
    const onProgress = (message: string) => messages.push(message);

    await expect(
      recipesValidateState({ recipe: 'workspace-recipe' }, onProgress)
    ).resolves.toBeUndefined();

    expect(messages).toContain(`${icons.success} Recipe state is valid`);
    expect(messages.some((msg) => msg.includes('Loading recipe'))).toBe(true);
    expect(
      messages.some((msg) => msg.includes('Getting recipe provides'))
    ).toBe(true);
  });

  it('should validate successfully when all project provides are present', async () => {
    const recipeData = {
      id: 'project-recipe',
      category: 'testing',
      summary: 'Test project recipe',
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
      provides: ['project.configured', 'project.feature.enabled'],
      requires: [],
    };

    setupMultiLibraryRecipes({
      'test-library': {
        testing: {
          'project-recipe': {
            recipeId: 'project-recipe',
            category: 'testing',
            level: 'project-only',
            provides: ['project.configured', 'project.feature.enabled'],
            requires: [],
          },
        },
      },
    });

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('state.json')) {
        return JSON.stringify({
          workspace: {},
          projects: {
            app: {
              'project.configured': true,
              'project.feature.enabled': true,
            },
            api: {
              'project.configured': true,
              'project.feature.enabled': true,
            },
          },
        });
      }
      if (filePath.includes('config.yaml')) {
        return yamlStringify({
          libraries: {
            'test-library': {
              repo: 'https://github.com/test/test-library.git',
              ref: 'main',
            },
          },
        });
      }
      if (
        filePath.includes('/test-library/testing/project-recipe/metadata.yaml')
      ) {
        return yamlStringify(recipeData);
      }
      if (filePath.includes('prompt.md')) {
        return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
      }
      if (
        filePath.includes('fix.md') ||
        filePath.includes('variants/basic.md')
      ) {
        return 'Basic fix prompt content';
      }
      if (filePath.includes('.json')) {
        return '{}';
      }
      return '';
    });

    const messages: string[] = [];
    const onProgress = (message: string) => messages.push(message);

    await expect(
      recipesValidateState({ recipe: 'project-recipe' }, onProgress)
    ).resolves.toBeUndefined();

    expect(messages).toContain(`${icons.success} Recipe state is valid`);
    expect(messages.some((msg) => msg.includes('Loading recipe'))).toBe(true);
    expect(
      messages.some((msg) => msg.includes('Getting recipe provides'))
    ).toBe(true);
  });

  it('should validate successfully with workspace-preferred recipe when workspace provides are present', async () => {
    const recipeData = {
      id: 'preferred-recipe',
      category: 'testing',
      summary: 'Test workspace-preferred recipe',
      level: 'workspace-preferred',
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
      provides: ['preferred.configured', 'preferred.feature.enabled'],
      requires: [],
    };

    setupMultiLibraryRecipes({
      'test-library': {
        testing: {
          'preferred-recipe': {
            recipeId: 'preferred-recipe',
            category: 'testing',
            level: 'workspace-preferred',
            provides: ['preferred.configured', 'preferred.feature.enabled'],
            requires: [],
          },
        },
      },
    });

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('state.json')) {
        return JSON.stringify({
          workspace: {
            'preferred.configured': true,
            'preferred.feature.enabled': true,
          },
          projects: {
            app: {
              'other.setting': true,
            },
          },
        });
      }
      if (filePath.includes('config.yaml')) {
        return yamlStringify({
          libraries: {
            'test-library': {
              repo: 'https://github.com/test/test-library.git',
              ref: 'main',
            },
          },
        });
      }
      if (
        filePath.includes(
          '/test-library/testing/preferred-recipe/metadata.yaml'
        )
      ) {
        return yamlStringify(recipeData);
      }
      if (filePath.includes('prompt.md')) {
        return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
      }
      if (
        filePath.includes('fix.md') ||
        filePath.includes('variants/basic.md')
      ) {
        return 'Basic fix prompt content';
      }
      if (filePath.includes('.json')) {
        return '{}';
      }
      return '';
    });

    const messages: string[] = [];
    const onProgress = (message: string) => messages.push(message);

    await expect(
      recipesValidateState({ recipe: 'preferred-recipe' }, onProgress)
    ).resolves.toBeUndefined();

    expect(messages).toContain(`${icons.success} Recipe state is valid`);
    expect(messages.some((msg) => msg.includes('Loading recipe'))).toBe(true);
    expect(
      messages.some((msg) => msg.includes('Getting recipe provides'))
    ).toBe(true);
  });

  it('should fail validation when workspace provides are missing', async () => {
    const recipeData = {
      id: 'workspace-missing-recipe',
      category: 'testing',
      summary: 'Test workspace recipe with missing provides',
      level: 'workspace-only',
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
      provides: ['workspace.configured', 'workspace.feature.enabled'],
      requires: [],
    };

    setupMultiLibraryRecipes({
      'test-library': {
        testing: {
          'workspace-missing-recipe': {
            recipeId: 'workspace-missing-recipe',
            category: 'testing',
            level: 'workspace-only',
            provides: ['workspace.configured', 'workspace.feature.enabled'],
            requires: [],
          },
        },
      },
    });

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('state.json')) {
        return JSON.stringify({
          workspace: {
            'workspace.configured': true,
          },
          projects: {},
        });
      }
      if (filePath.includes('config.yaml')) {
        return yamlStringify({
          libraries: {
            'test-library': {
              repo: 'https://github.com/test/test-library.git',
              ref: 'main',
            },
          },
        });
      }
      if (
        filePath.includes(
          '/test-library/testing/workspace-missing-recipe/metadata.yaml'
        )
      ) {
        return yamlStringify(recipeData);
      }
      if (filePath.includes('prompt.md')) {
        return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
      }
      if (
        filePath.includes('fix.md') ||
        filePath.includes('variants/basic.md')
      ) {
        return 'Basic fix prompt content';
      }
      if (filePath.includes('.json')) {
        return '{}';
      }
      return '';
    });

    const messages: string[] = [];
    const onProgress = (message: string) => messages.push(message);

    await expect(
      recipesValidateState({ recipe: 'workspace-missing-recipe' }, onProgress)
    ).rejects.toThrow(
      'Missing provides in state file: workspace.feature.enabled'
    );

    expect(messages).toContain(`${icons.error} Validation failed`);
  });

  it('should pass validation when workspace recipe has no provides', async () => {
    const recipeData = {
      id: 'no-provides-recipe',
      category: 'testing',
      summary: 'Test recipe with no provides',
      level: 'workspace-only',
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
      provides: [],
      requires: [],
    };

    setupMultiLibraryRecipes({
      'test-library': {
        testing: {
          'no-provides-recipe': {
            recipeId: 'no-provides-recipe',
            category: 'testing',
            level: 'workspace-only',
            provides: [],
            requires: [],
          },
        },
      },
    });

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('state.json')) {
        return JSON.stringify({
          workspace: {},
          projects: {},
        });
      }
      if (filePath.includes('config.yaml')) {
        return yamlStringify({
          libraries: {
            'test-library': {
              repo: 'https://github.com/test/test-library.git',
              ref: 'main',
            },
          },
        });
      }
      if (
        filePath.includes(
          '/test-library/testing/no-provides-recipe/metadata.yaml'
        )
      ) {
        return yamlStringify(recipeData);
      }
      if (filePath.includes('prompt.md')) {
        return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
      }
      if (
        filePath.includes('fix.md') ||
        filePath.includes('variants/basic.md')
      ) {
        return 'Basic fix prompt content';
      }
      if (filePath.includes('.json')) {
        return '{}';
      }
      return '';
    });

    const messages: string[] = [];
    const onProgress = (message: string) => messages.push(message);

    await expect(
      recipesValidateState({ recipe: 'no-provides-recipe' }, onProgress)
    ).resolves.toBeUndefined();

    expect(messages).toContain(
      `${icons.success} Recipe has no provides to validate`
    );
  });

  it('should handle recipe not found', async () => {
    setupMultiLibraryRecipes({});

    const messages: string[] = [];
    const onProgress = (message: string) => messages.push(message);

    await expect(
      recipesValidateState({ recipe: 'nonexistent-recipe' }, onProgress)
    ).rejects.toThrow('Failed to load recipe');

    expect(messages.some((msg) => msg.includes('Failed to load recipe'))).toBe(
      true
    );
  });

  it('should handle state file read error', async () => {
    const recipeData = {
      id: 'error-recipe',
      category: 'testing',
      summary: 'Test error recipe',
      level: 'workspace-only',
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
      provides: ['error.configured'],
      requires: [],
    };

    setupMultiLibraryRecipes({
      'test-library': {
        testing: {
          'error-recipe': {
            recipeId: 'error-recipe',
            category: 'testing',
            level: 'workspace-only',
            provides: ['error.configured'],
            requires: [],
          },
        },
      },
    });

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('state.json')) {
        throw new Error('File read error');
      }
      if (filePath.includes('config.yaml')) {
        return yamlStringify({
          libraries: {
            'test-library': {
              repo: 'https://github.com/test/test-library.git',
              ref: 'main',
            },
          },
        });
      }
      if (
        filePath.includes('/test-library/testing/error-recipe/metadata.yaml')
      ) {
        return yamlStringify(recipeData);
      }
      if (filePath.includes('prompt.md')) {
        return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
      }
      if (
        filePath.includes('fix.md') ||
        filePath.includes('variants/basic.md')
      ) {
        return 'Basic fix prompt content';
      }
      if (filePath.includes('.json')) {
        return '{}';
      }
      return '';
    });

    const messages: string[] = [];
    const onProgress = (message: string) => messages.push(message);

    await expect(
      recipesValidateState({ recipe: 'error-recipe' }, onProgress)
    ).rejects.toThrow();

    expect(messages).toContain(`${icons.error} Validation failed`);
  });

  it('should show detailed debug information when debug mode is enabled', async () => {
    const recipeData = {
      id: 'debug-recipe',
      category: 'testing',
      summary: 'Test debug recipe',
      level: 'workspace-only',
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
      provides: ['debug.configured', 'debug.feature.enabled'],
      requires: [],
    };

    setupMultiLibraryRecipes({
      'test-library': {
        testing: {
          'debug-recipe': {
            recipeId: 'debug-recipe',
            category: 'testing',
            level: 'workspace-only',
            provides: ['debug.configured', 'debug.feature.enabled'],
            requires: [],
          },
        },
      },
    });

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('state.json')) {
        return JSON.stringify({
          workspace: {
            'debug.configured': true,
            'debug.feature.enabled': true,
          },
          projects: {},
        });
      }
      if (filePath.includes('config.yaml')) {
        return yamlStringify({
          libraries: {
            'test-library': {
              repo: 'https://github.com/test/test-library.git',
              ref: 'main',
            },
          },
        });
      }
      if (
        filePath.includes('/test-library/testing/debug-recipe/metadata.yaml')
      ) {
        return yamlStringify(recipeData);
      }
      if (filePath.includes('prompt.md')) {
        return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
      }
      if (
        filePath.includes('fix.md') ||
        filePath.includes('variants/basic.md')
      ) {
        return 'Basic fix prompt content';
      }
      if (filePath.includes('.json')) {
        return '{}';
      }
      return '';
    });

    const messages: string[] = [];
    const onProgress = (message: string) => messages.push(message);

    await expect(
      recipesValidateState({ recipe: 'debug-recipe', debug: true }, onProgress)
    ).resolves.toBeUndefined();

    expect(messages.some((msg) => msg.includes('Recipe provides:'))).toBe(true);
    expect(messages.some((msg) => msg.includes('State file path:'))).toBe(true);
    expect(
      messages.some((msg) => msg.includes('Loading recipe: debug-recipe'))
    ).toBe(true);
    expect(
      messages.some((msg) => msg.includes('All 2 provides found in state file'))
    ).toBe(true);
    expect(messages).toContain(`${icons.success} Recipe state is valid`);
  });
});
