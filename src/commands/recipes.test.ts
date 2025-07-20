import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ValidateOptions } from './recipes';

const mockHomedir = jest.fn<() => string>(() => '/test/home');
const mockTmpdir = jest.fn<() => string>(() => '/tmp');
const mockExistsSync = jest.fn<(path: string) => boolean>();
const mockStatSync = jest.fn<(path: string) => fs.Stats>();
const mockReaddirSync = jest.fn<(path: string) => string[]>();
const mockReadFileSync = jest.fn<(path: string, encoding?: string) => string>();
const mockReadYaml = jest.fn<(path: string) => Promise<any>>();
const mockParseYaml = jest.fn<(content: string) => any>();
const mockQuery = jest.fn();
const mockCloneRepository = jest.fn();
const mockRmSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockWriteFileSync = jest.fn();

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
}));

jest.unstable_mockModule('../utils/yaml.utils', () => ({
  readYaml: mockReadYaml,
  parseYaml: mockParseYaml,
}));

jest.unstable_mockModule('@anthropic-ai/claude-code', () => ({
  query: mockQuery,
}));

jest.unstable_mockModule('../utils/git-operations.utils', () => ({
  cloneRepository: mockCloneRepository,
}));

describe('Recipes Command Integration Tests', () => {
  let performRecipesValidate: typeof import('./recipes').performRecipesValidate;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    mockHomedir.mockImplementation(() => '/test/home');
    mockTmpdir.mockImplementation(() => '/tmp');
    mockExistsSync.mockImplementation(() => true);
    mockStatSync.mockImplementation(() => ({
      isDirectory: () => true,
      isFile: () => false,
    } as fs.Stats));
    mockReaddirSync.mockImplementation(() => []);
    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('prompt.md')) {
        return '## Goal\nTest goal\n\n## Investigation\nTest investigation\n\n## Expected Output\nTest output';
      } else if (filePath.includes('fixes/basic.md')) {
        return 'Basic fix prompt content';
      }
      return '';
    });
    mockReadYaml.mockImplementation(() => Promise.resolve({
      id: 'test-recipe',
      category: 'test',
      summary: 'Test recipe',
      ecosystems: [{
        id: 'javascript',
        default_variant: 'basic',
        variants: [{
          id: 'basic',
          fix_prompt: 'fixes/basic.md'
        }]
      }],
      provides: ['test-functionality'],
      requires: []
    }));
    mockCloneRepository.mockImplementation(() => Promise.resolve());
    mockRmSync.mockImplementation(() => {});
    
    const recipesModule = await import('./recipes');
    performRecipesValidate = recipesModule.performRecipesValidate;
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });


  it('should detect recipe folder input type', async () => {
    const options = { target: '/path/to/recipe' };
    
    mockReadYaml.mockImplementation(() => Promise.resolve({
      id: 'recipe',
      category: 'test',
      summary: 'Test recipe',
      ecosystems: [{
        id: 'javascript',
        default_variant: 'basic',
        variants: [{
          id: 'basic',
          fix_prompt: 'fixes/basic.md'
        }]
      }],
      provides: ['test-functionality'],
      requires: []
    }));
    
    const mockProgress = jest.fn();
    const result = await performRecipesValidate(options, mockProgress);
    
    expect(result.context.inputType).toBe('recipe-folder');
    expect(result.context.target).toBe('/path/to/recipe');
    expect(result.context.resolvedPath).toBe('/path/to/recipe');
    expect(result.context.recipesValidated).toEqual(['recipe']);
    expect(result.messages).toBeDefined();
    expect(result.messages.some(msg => msg.type === 'success' && msg.text.includes("Recipe 'recipe' is valid"))).toBe(true);
    expect(mockProgress).toHaveBeenCalledWith('Validating recipe folder: /path/to/recipe');
  });

  it('should detect library input type', async () => {
    const options = { target: '/path/to/library' };
    
    mockExistsSync.mockImplementation((filePath: string) => {
      if (filePath === '/path/to/library') return true;
      if (filePath === '/path/to/library/metadata.yaml') return false;
      if (filePath === '/path/to/library/recipe1') return true;
      if (filePath === '/path/to/library/recipe2') return true;
      if (filePath === '/path/to/library/recipe1/metadata.yaml') return true;
      if (filePath === '/path/to/library/recipe2/metadata.yaml') return true;
      if (filePath === '/path/to/library/recipe1/prompt.md') return true;
      if (filePath === '/path/to/library/recipe2/prompt.md') return true;
      if (filePath === '/path/to/library/recipe1/fixes') return true;
      if (filePath === '/path/to/library/recipe2/fixes') return true;
      if (filePath === '/path/to/library/recipe1/fixes/basic.md') return true;
      if (filePath === '/path/to/library/recipe2/fixes/basic.md') return true;
      return false;
    });
    
    mockStatSync.mockImplementation((filePath: string) => ({
      isDirectory: () => !filePath.includes('.'),
      isFile: () => filePath.includes('.')
    } as fs.Stats));
    
    mockReaddirSync.mockImplementation((dirPath: string) => {
      if (dirPath === '/path/to/library') {
        return ['recipe1', 'recipe2'];
      }
      return [];
    });
    
    mockReadYaml.mockImplementation((filePath: string) => {
      if (filePath.includes('recipe1/metadata.yaml')) {
        return Promise.resolve({
          id: 'recipe1',
          category: 'test',
          summary: 'Recipe 1',
          ecosystems: [{ id: 'javascript', default_variant: 'basic', variants: [{ id: 'basic', fix_prompt: 'fixes/basic.md' }] }],
          provides: ['feature1'],
          requires: []
        });
      } else if (filePath.includes('recipe2/metadata.yaml')) {
        return Promise.resolve({
          id: 'recipe2',
          category: 'test',
          summary: 'Recipe 2',
          ecosystems: [{ id: 'python', default_variant: 'basic', variants: [{ id: 'basic', fix_prompt: 'fixes/basic.md' }] }],
          provides: ['feature2'],
          requires: []
        });
      }
      return Promise.resolve({});
    });
    
    const mockProgress = jest.fn();
    const result = await performRecipesValidate(options, mockProgress);
    
    expect(result.context.inputType).toBe('library');
    expect(result.context.target).toBe('/path/to/library');
    expect(result.context.resolvedPath).toBe('/path/to/library');
    expect(result.context.recipesValidated).toEqual(expect.arrayContaining(['recipe1', 'recipe2']));
    expect(result.summary).toBeDefined();
    expect(result.summary!.total).toBe(2);
    expect(result.summary!.valid).toBe(2);
    expect(mockProgress).toHaveBeenCalledWith('This will validate all recipes in the library: /path/to/library');
  });

  it('should handle recipe search in nested directories', async () => {
    const options = { target: 'nested-recipe' };
    
    mockExistsSync.mockImplementation((filePath: string) => {
      if (filePath === '/test/home/.chorenzo/recipes') return true;
      if (filePath === '/test/home/.chorenzo/recipes/lib1') return true;
      if (filePath === '/test/home/.chorenzo/recipes/lib2') return true;
      if (filePath === '/test/home/.chorenzo/recipes/lib1/nested-recipe') return true;
      if (filePath === '/test/home/.chorenzo/recipes/lib1/nested-recipe/metadata.yaml') return true;
      if (filePath === '/test/home/.chorenzo/recipes/lib1/nested-recipe/prompt.md') return true;
      if (filePath === '/test/home/.chorenzo/recipes/lib1/nested-recipe/fixes') return true;
      if (filePath === '/test/home/.chorenzo/recipes/lib1/nested-recipe/fixes/basic.md') return true;
      return false;
    });
    
    mockStatSync.mockImplementation((filePath: string) => ({
      isDirectory: () => {
        return filePath === '/test/home/.chorenzo/recipes' ||
               filePath === '/test/home/.chorenzo/recipes/lib1' ||
               filePath === '/test/home/.chorenzo/recipes/lib2' ||
               filePath === '/test/home/.chorenzo/recipes/lib1/nested-recipe';
      },
      isFile: () => filePath.includes('.')
    } as fs.Stats));
    
    mockReaddirSync.mockImplementation((dirPath: string) => {
      if (dirPath === '/test/home/.chorenzo/recipes') {
        return ['lib1', 'lib2'];
      } else if (dirPath === '/test/home/.chorenzo/recipes/lib1') {
        return ['nested-recipe'];
      } else if (dirPath === '/test/home/.chorenzo/recipes/lib2') {
        return [];
      }
      return [];
    });
    
    mockReadYaml.mockImplementation(() => Promise.resolve({
      id: 'nested-recipe',
      category: 'test',
      summary: 'Nested recipe',
      ecosystems: [{
        id: 'javascript',
        default_variant: 'basic',
        variants: [{
          id: 'basic',
          fix_prompt: 'fixes/basic.md'
        }]
      }],
      provides: ['nested-functionality'],
      requires: []
    }));
    
    const mockProgress = jest.fn();
    const result = await performRecipesValidate(options, mockProgress);
    
    expect(result.context.inputType).toBe('recipe-name');
    expect(result.context.target).toBe('nested-recipe');
    expect(result.context.resolvedPath).toBe('nested-recipe');
    expect(result.context.recipesValidated).toEqual(['nested-recipe']);
    expect(result.messages).toBeDefined();
    expect(result.messages.some(msg => msg.type === 'success' && msg.text.includes("Recipe 'nested-recipe' is valid"))).toBe(true);
    expect(mockProgress).toHaveBeenCalledWith('Searching for recipe: nested-recipe');
  });

  it('should detect git URL input type', async () => {
    const options = { target: 'https://github.com/user/recipes.git' };
    
    const mockProgress = jest.fn();
    const result = await performRecipesValidate(options, mockProgress);
    
    expect(result.context.inputType).toBe('git-url');
    expect(result.context.target).toBe('https://github.com/user/recipes.git');
    expect(result.context.resolvedPath).toBe('https://github.com/user/recipes.git');
    expect(result.summary).toBeDefined();
    expect(result.summary!.total).toBe(0);
    expect(mockProgress).toHaveBeenCalledWith('This will clone and validate recipes from: https://github.com/user/recipes.git');
    expect(mockProgress).toHaveBeenCalledWith('Cloning repository...');
    expect(mockProgress).toHaveBeenCalledWith('Validating cloned recipes...');
    expect(mockCloneRepository).toHaveBeenCalledWith('https://github.com/user/recipes.git', expect.stringMatching(/\/tmp\/chorenzo-recipes-user-recipes-\d+/), 'main');
  });

  it('should handle path resolution with tilde', async () => {
    const options = { target: '~/my-recipes/test-recipe' };
    
    mockReadYaml.mockImplementation(() => Promise.resolve({
      id: 'test-recipe',
      category: 'test',
      summary: 'Test recipe',
      ecosystems: [{
        id: 'javascript',
        default_variant: 'basic',
        variants: [{
          id: 'basic',
          fix_prompt: 'fixes/basic.md'
        }]
      }],
      provides: ['test-functionality'],
      requires: []
    }));
    
    const mockProgress = jest.fn();
    const result = await performRecipesValidate(options, mockProgress);
    
    expect(result.context.target).toBe('~/my-recipes/test-recipe');
    expect(result.context.resolvedPath).toBe('/test/home/my-recipes/test-recipe');
    expect(result.context.inputType).toBe('recipe-folder');
    expect(mockProgress).toHaveBeenCalledWith('Validating recipe folder: /test/home/my-recipes/test-recipe');
  });


  it('should throw error when target parameter is missing', async () => {
    const options = { target: '' };
    
    await expect(performRecipesValidate(options)).rejects.toThrow('Target parameter is required for validation');
  });

  it('should handle recipe not found by name', async () => {
    const options = { target: 'nonexistent-recipe' };
    
    mockExistsSync.mockImplementation((filePath: string) => {
      if (filePath === '/test/home/.chorenzo/recipes') return true;
      if (filePath === '/test/home/.chorenzo/recipes/other-recipe') return true;
      if (filePath === '/test/home/.chorenzo/recipes/other-recipe/metadata.yaml') return true;
      return false;
    });
    
    mockStatSync.mockImplementation((filePath: string) => ({
      isDirectory: () => !filePath.includes('.'),
      isFile: () => filePath.includes('.')
    } as fs.Stats));
    
    mockReaddirSync.mockImplementation((dirPath: string) => {
      if (dirPath === '/test/home/.chorenzo/recipes') {
        return ['other-recipe'];
      }
      return [];
    });
    
    await expect(performRecipesValidate(options)).rejects.toThrow("Recipe 'nonexistent-recipe' not found in ~/.chorenzo/recipes");
  });

  it('should handle YAML parsing errors', async () => {
    const options = { target: '/path/to/broken-recipe' };
    
    mockReadYaml.mockImplementation(() => {
      throw new Error('Invalid YAML syntax');
    });
    
    await expect(performRecipesValidate(options)).rejects.toThrow('Failed to parse metadata.yaml: Invalid YAML syntax');
  });

  it('should handle missing required files', async () => {
    const options = { target: '/path/to/incomplete-recipe' };
    
    mockExistsSync.mockImplementation((filePath: string) => {
      return filePath === '/path/to/incomplete-recipe' || 
             filePath.includes('metadata.yaml') ||
             !filePath.includes('prompt.md');
    });
    
    await expect(performRecipesValidate(options)).rejects.toThrow('Missing prompt.md in recipe');
  });
});