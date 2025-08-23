import { afterEach, beforeEach, jest } from '@jest/globals';
import * as fs from 'fs';
import { stringify as yamlStringify } from 'yaml';

import type { ConfigLibrary } from '~/types/config';
import type { RecipeDependency, RecipeLevel } from '~/types/recipe';

export const mockHomedir = jest.fn<() => string>(() => '/test/home');
export const mockTmpdir = jest.fn<() => string>(() => '/tmp');
export const mockExistsSync = jest.fn<(path: string) => boolean>();
export const mockStatSync = jest.fn<(path: string) => fs.Stats>();
export const mockReaddirSync = jest.fn<(path: string) => string[]>();
export const mockReadFileSync =
  jest.fn<(path: string, encoding?: string) => string>();
export const mockQuery = jest.fn();
export const mockPerformAnalysis =
  jest.fn<() => Promise<import('./analyze').AnalysisResult>>();
export const mockRmSync = jest.fn();
export const mockMkdirSync = jest.fn();
export const mockWriteFileSync = jest.fn();
export const mockAppendFileSync = jest.fn();
export const mockCreateWriteStream = jest.fn();
export const mockWriteFileAtomicSync = jest.fn();

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

jest.unstable_mockModule('@anthropic-ai/claude-code', () => ({
  query: mockQuery,
}));

jest.unstable_mockModule('./analyze', () => ({
  performAnalysis: mockPerformAnalysis,
}));

jest.unstable_mockModule('write-file-atomic', () => ({
  sync: mockWriteFileAtomicSync,
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

export const setupLocationMocks = (
  fileStructure: Record<string, boolean>,
  directoryStructure: Record<string, string[]>
) => {
  mockExistsSync.mockImplementation((filePath: string) => {
    return fileStructure[filePath] || false;
  });

  mockStatSync.mockImplementation(
    (filePath: string) =>
      ({
        isDirectory: () => {
          if (filePath.endsWith('.yaml') || filePath.endsWith('.md')) {
            return false;
          }
          return fileStructure[filePath] || false;
        },
        isFile: () => filePath.endsWith('.yaml') || filePath.endsWith('.md'),
      }) as fs.Stats
  );

  mockReaddirSync.mockImplementation((dirPath: string) => {
    return directoryStructure[dirPath] || [];
  });
};

export const createMockYamlData = (
  options: {
    recipeId?: string;
    category?: string;
    level?: 'workspace-only' | 'project-only' | 'workspace-preferred';
    variants?: Array<{ id: string; fix_prompt: string }>;
    requires?: Array<{ key: string; equals: string }>;
    provides?: string[];
  } = {}
) => {
  const {
    recipeId = 'test-recipe',
    category = 'test',
    level = 'project-only',
    variants = [{ id: 'basic', fix_prompt: 'variants/basic.md' }],
    requires = [],
    provides = ['test-functionality'],
  } = options;

  return {
    config: {
      libraries: {
        'test-recipe': createLibraryConfig('test-recipe'),
      },
    },
    metadata: {
      id: recipeId,
      category,
      summary: 'Test recipe',
      level,
      ecosystems: [
        {
          id: 'javascript',
          default_variant: 'basic',
          variants,
        },
      ],
      provides,
      requires,
    },
  };
};

export interface TestRecipeConfig {
  recipeId: string;
  category: string;
  level?: RecipeLevel;
  provides?: string[];
  requires?: RecipeDependency[];
}

export interface TestLibraryStructure {
  [libraryName: string]: {
    [categoryName: string]: {
      [recipeName: string]: TestRecipeConfig;
    };
  };
}

export const createLibraryConfig = (
  libraryName: string,
  repoUrl?: string
): ConfigLibrary => {
  return {
    repo:
      repoUrl || `https://github.com/chorenzo-dev/recipes-${libraryName}.git`,
    ref: 'main',
  };
};

export const setupRecipeFiles = (
  recipePath: string,
  fileStructure: Record<string, boolean>
): void => {
  fileStructure[recipePath] = true;
  fileStructure[`${recipePath}/metadata.yaml`] = true;
  fileStructure[`${recipePath}/prompt.md`] = true;
  fileStructure[`${recipePath}/fix.md`] = true;
};

export const setupRecipeExistenceChecks = (
  recipePath: string,
  recipePathChecks: Array<[string, boolean]>
): void => {
  recipePathChecks.push([recipePath, true]);
  recipePathChecks.push([`${recipePath}/metadata.yaml`, true]);
  recipePathChecks.push([`${recipePath}/prompt.md`, true]);
  recipePathChecks.push([`${recipePath}/fix.md`, true]);
};

export const setupCategoryStructure = (
  libraryPath: string,
  categoryName: string,
  recipes: Record<string, TestRecipeConfig>,
  fileStructure: Record<string, boolean>,
  directoryStructure: Record<string, string[]>
): void => {
  const categoryPath = `${libraryPath}/${categoryName}`;
  fileStructure[categoryPath] = true;
  directoryStructure[categoryPath] = Object.keys(recipes);

  for (const [recipeName] of Object.entries(recipes)) {
    const recipePath = `${categoryPath}/${recipeName}`;
    setupRecipeFiles(recipePath, fileStructure);
  }
};

export const setupLibraryStructure = (
  libraryName: string,
  categories: Record<string, Record<string, TestRecipeConfig>>,
  fileStructure: Record<string, boolean>,
  directoryStructure: Record<string, string[]>
): void => {
  const libraryPath = `/test/home/.chorenzo/recipes/${libraryName}`;
  fileStructure[libraryPath] = true;
  directoryStructure[libraryPath] = Object.keys(categories);

  for (const [categoryName, recipes] of Object.entries(categories)) {
    setupCategoryStructure(
      libraryPath,
      categoryName,
      recipes,
      fileStructure,
      directoryStructure
    );
  }
};

export const setupRecipeContent = (
  libraries: TestLibraryStructure,
  mockReadFileSync: jest.MockedFunction<
    (path: string, encoding?: string) => string
  >,
  libraryConfigs: Record<string, ConfigLibrary>
): void => {
  mockReadFileSync.mockImplementation((filePath: string) => {
    if (filePath.includes('config.yaml')) {
      return yamlStringify({ libraries: libraryConfigs });
    }

    for (const [libraryName, categories] of Object.entries(libraries)) {
      for (const [categoryName, recipes] of Object.entries(categories)) {
        for (const [recipeName, recipeConfig] of Object.entries(recipes)) {
          if (
            filePath.includes(
              `/${libraryName}/${categoryName}/${recipeName}/metadata.yaml`
            )
          ) {
            const mockData = createMockYamlData(recipeConfig);
            return yamlStringify(mockData.metadata);
          }
        }
      }
    }

    if (filePath.includes('prompt.md')) {
      return '## Goal\nTest prompt\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
    }
    if (filePath.includes('fix.md')) {
      return 'Test fix content';
    }
    return '';
  });
};

export const setupMultiLibraryRecipes = (
  libraries: TestLibraryStructure
): void => {
  const fileStructure: Record<string, boolean> = {
    '/test/home/.chorenzo/config.yaml': true,
    '/test/home/.chorenzo/recipes': true,
  };

  const directoryStructure: Record<string, string[]> = {
    '/test/home/.chorenzo/recipes': Object.keys(libraries),
  };

  const libraryConfigs: Record<string, ConfigLibrary> = {};

  for (const [libraryName, categories] of Object.entries(libraries)) {
    libraryConfigs[libraryName] = createLibraryConfig(libraryName);
    setupLibraryStructure(
      libraryName,
      categories,
      fileStructure,
      directoryStructure
    );
  }

  setupLocationMocks(fileStructure, directoryStructure);
  setupRecipeContent(libraries, mockReadFileSync, libraryConfigs);
};

export const setupDefaultMocks = () => {
  mockHomedir.mockImplementation(() => '/test/home');
  mockTmpdir.mockImplementation(() => '/tmp');
  mockWriteFileAtomicSync.mockImplementation(() => {});
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
  const mockYamlData = createMockYamlData();
  mockReadFileSync.mockImplementation((filePath: string) => {
    if (filePath.includes('prompt.md')) {
      return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
    } else if (filePath.includes('fix.md')) {
      return 'Basic fix prompt content';
    } else if (filePath.includes('variants/basic.md')) {
      return 'Basic variant fix prompt content';
    } else if (filePath.includes('plan') && filePath.includes('.md')) {
      return yamlStringify({
        title: 'test plan',
        steps: [
          {
            type: 'configure',
            description: 'test',
          },
        ],
        outputs: {
          'test_feature.exists': true,
        },
      });
    } else if (filePath.includes('config.yaml')) {
      return yamlStringify(mockYamlData.config);
    } else if (filePath.includes('metadata.yaml')) {
      return yamlStringify(mockYamlData.metadata);
    } else if (
      filePath.includes('apply_recipe_workspace_application_instructions.md')
    ) {
      return 'Apply this workspace-level recipe...';
    } else if (
      filePath.includes('apply_recipe_project_application_instructions.md')
    ) {
      return 'Apply this project-level recipe to {{ project_path }}...';
    } else if (
      filePath.includes('apply_recipe_workspace_state_management.md')
    ) {
      return 'Update workspace state at {{ workspace_root }}/.chorenzo/state.json...';
    } else if (filePath.includes('apply_recipe_project_state_management.md')) {
      return 'Update project state for {{ project_relative_path }} at {{ workspace_root }}/.chorenzo/state.json...';
    } else if (filePath.includes('.json')) {
      return '{}';
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
  mockRmSync.mockImplementation(() => {});
  mockQuery.mockImplementation(async function* () {
    const validationResult = {
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
    };
    yield {
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: JSON.stringify(validationResult),
    };
  });
};

export const setupSharedMocks = () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });
};
