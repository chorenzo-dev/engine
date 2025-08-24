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

  const setupStateValidationMocks = (
    stateData: unknown,
    errorOnStateRead?: boolean
  ) => {
    const originalMock = mockReadFileSync.getMockImplementation();

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('state.json')) {
        if (errorOnStateRead) {
          throw new Error('File read error');
        }
        return JSON.stringify(stateData);
      }
      return originalMock?.(filePath) || '';
    });
  };

  const createTestMessages = () => {
    const messages: string[] = [];
    const onProgress = (message: string) => messages.push(message);
    return { messages, onProgress };
  };

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

    const stateData = {
      workspace: {
        'workspace-recipe.applied': true,
        'workspace.configured': true,
        'workspace.feature.enabled': true,
      },
      projects: {},
    };

    setupStateValidationMocks(stateData);

    const { messages, onProgress } = createTestMessages();

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

    const stateData = {
      workspace: {},
      projects: {
        app: {
          'project-recipe.applied': true,
          'project.configured': true,
          'project.feature.enabled': true,
        },
        api: {
          'project-recipe.applied': true,
          'project.configured': true,
          'project.feature.enabled': true,
        },
      },
    };

    setupStateValidationMocks(stateData);

    const { messages, onProgress } = createTestMessages();

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

    const stateData = {
      workspace: {
        'preferred-recipe.applied': true,
        'preferred.configured': true,
        'preferred.feature.enabled': true,
      },
      projects: {},
    };

    setupStateValidationMocks(stateData);

    const { messages, onProgress } = createTestMessages();

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
            'workspace-missing-recipe.applied': true,
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
        return yamlStringify({
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
        });
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

    const { messages, onProgress } = createTestMessages();

    await expect(
      recipesValidateState({ recipe: 'workspace-missing-recipe' }, onProgress)
    ).rejects.toThrow(
      'Missing provides in state file: workspace.feature.enabled'
    );

    expect(messages).toContain(`${icons.error} Validation failed`);
  });

  it('should pass validation when workspace recipe has no provides', async () => {
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
          workspace: {
            'no-provides-recipe.applied': true,
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
          '/test-library/testing/no-provides-recipe/metadata.yaml'
        )
      ) {
        return yamlStringify({
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
        });
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

    const { messages, onProgress } = createTestMessages();

    await expect(
      recipesValidateState({ recipe: 'no-provides-recipe' }, onProgress)
    ).resolves.toBeUndefined();

    expect(messages).toContain(
      `${icons.success} Recipe has no provides to validate`
    );
  });

  it('should handle recipe not found', async () => {
    setupMultiLibraryRecipes({});

    const { messages, onProgress } = createTestMessages();

    await expect(
      recipesValidateState({ recipe: 'nonexistent-recipe' }, onProgress)
    ).rejects.toThrow('Failed to load recipe');

    expect(messages.some((msg) => msg.includes('Failed to load recipe'))).toBe(
      true
    );
  });

  it('should handle state file read error', async () => {
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

    setupStateValidationMocks(null, true);

    const { messages, onProgress } = createTestMessages();

    await expect(
      recipesValidateState({ recipe: 'error-recipe' }, onProgress)
    ).rejects.toThrow();

    expect(messages).toContain(`${icons.error} Validation failed`);
  });

  it('should detect redundant keys related to the specific recipe', async () => {
    setupMultiLibraryRecipes({
      'test-library': {
        testing: {
          'workspace-recipe': {
            recipeId: 'workspace-recipe',
            category: 'testing',
            level: 'workspace-only',
            provides: ['workspace.configured'],
            requires: [],
          },
        },
      },
    });

    const stateData = {
      workspace: {
        'workspace-recipe.applied': true,
        'workspace.configured': true,
        'workspace.extra.setting': true,
        'workspace.obsolete': true,
        'unrelated.key': true,
      },
      projects: {
        app: {
          'other.recipe.setting': true,
        },
      },
    };

    setupStateValidationMocks(stateData);

    const { messages, onProgress } = createTestMessages();

    await expect(
      recipesValidateState({ recipe: 'workspace-recipe' }, onProgress)
    ).rejects.toThrow(
      'Redundant keys in state file: workspace.extra.setting, workspace.obsolete'
    );

    expect(messages).toContain(`${icons.error} Validation failed`);
  });

  it('should not flag unrelated keys as redundant', async () => {
    setupMultiLibraryRecipes({
      'test-library': {
        testing: {
          'code-formatting': {
            recipeId: 'code-formatting',
            category: 'testing',
            level: 'workspace-only',
            provides: ['code-formatting.applied', 'code-formatting.configured'],
            requires: [],
          },
        },
      },
    });

    const stateData = {
      workspace: {
        'code-formatting.applied': true,
        'code-formatting.configured': true,
        'pre-commit-checks.applied': true,
        'ci-pipeline.configured': true,
        'other.recipe.setting': true,
      },
      projects: {},
    };

    setupStateValidationMocks(stateData);

    const { messages, onProgress } = createTestMessages();

    await expect(
      recipesValidateState({ recipe: 'code-formatting' }, onProgress)
    ).resolves.toBeUndefined();

    expect(messages).toContain(`${icons.success} Recipe state is valid`);
  });

  it('should detect when recipe was not applied', async () => {
    setupMultiLibraryRecipes({
      'test-library': {
        testing: {
          'unapplied-recipe': {
            recipeId: 'unapplied-recipe',
            category: 'testing',
            level: 'workspace-only',
            provides: ['unapplied.configured'],
            requires: [],
          },
        },
      },
    });

    const stateData = {
      workspace: {
        'unapplied.configured': true,
        'unapplied.extra.setting': true,
      },
      projects: {},
    };

    setupStateValidationMocks(stateData);

    const { messages, onProgress } = createTestMessages();

    await expect(
      recipesValidateState({ recipe: 'unapplied-recipe' }, onProgress)
    ).rejects.toThrow(
      'Recipe was not applied (missing unapplied-recipe.applied)'
    );

    expect(messages).toContain(`${icons.error} Validation failed`);
  });

  it('should pass validation when recipe applied is false (redundant keys expected)', async () => {
    setupMultiLibraryRecipes({
      'test-library': {
        testing: {
          'failed-recipe': {
            recipeId: 'failed-recipe',
            category: 'testing',
            level: 'workspace-only',
            provides: ['failed.configured'],
            requires: [],
          },
        },
      },
    });

    const stateData = {
      workspace: {
        'failed-recipe.applied': false,
        'failed.configured': true,
        'failed.extra.setting': true,
      },
      projects: {},
    };

    setupStateValidationMocks(stateData);

    const { messages, onProgress } = createTestMessages();

    await expect(
      recipesValidateState({ recipe: 'failed-recipe' }, onProgress)
    ).resolves.toBeUndefined();

    expect(messages).toContain(`${icons.success} Recipe state is valid`);
  });

  it('should show detailed debug information when debug mode is enabled', async () => {
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
            'debug-recipe.applied': true,
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
        return yamlStringify({
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
        });
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

    const { messages, onProgress } = createTestMessages();

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
    expect(
      messages.some((msg) =>
        msg.includes('No redundant keys found in state file')
      )
    ).toBe(true);
    expect(messages).toContain(`${icons.success} Recipe state is valid`);
  });

  it('should detect redundant keys even when recipe has no provides', async () => {
    setupMultiLibraryRecipes({
      'test-library': {
        testing: {
          'empty-provides-recipe': {
            recipeId: 'empty-provides-recipe',
            category: 'testing',
            level: 'workspace-only',
            provides: [],
            requires: [],
          },
        },
      },
    });

    const stateData = {
      workspace: {
        'empty-provides-recipe.applied': true,
        'empty-provides-recipe.configured': true,
        'empty-provides-recipe.extra.setting': true,
      },
      projects: {},
    };

    setupStateValidationMocks(stateData);

    const { messages, onProgress } = createTestMessages();

    await expect(
      recipesValidateState({ recipe: 'empty-provides-recipe' }, onProgress)
    ).rejects.toThrow(
      'Redundant keys in state file: empty-provides-recipe.configured, empty-provides-recipe.extra.setting'
    );

    expect(messages).toContain(`${icons.error} Validation failed`);
  });
});
