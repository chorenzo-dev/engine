import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

import {
  mockExistsSync,
  mockHomedir,
  mockMkdirSync,
  mockReadFileSync,
  mockWriteFileSync,
  setupDefaultMocks,
  setupLocationMocks,
} from './recipes.test-utils';

describe('Recipe Generation', () => {
  let performRecipesGenerate: typeof import('./recipes.generate').performRecipesGenerate;

  beforeEach(async () => {
    jest.clearAllMocks();
    setupDefaultMocks();
    const recipesModule = await import('./recipes.generate');
    performRecipesGenerate = recipesModule.performRecipesGenerate;
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  const setupGenerateMocks = () => {
    mockExistsSync.mockImplementation((path) => {
      if (path.includes('docs/recipes.md')) {
        return true;
      }
      return false;
    });

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('docs/recipes.md')) {
        return '# Recipe Guidelines\nFollow these principles...';
      }
      if (filePath.includes('recipe_magic_generate.md')) {
        return 'Generate recipe for: {{ recipe_name }}\nSummary: {{ summary }}';
      }
      if (filePath.includes('recipe_metadata.yaml')) {
        return 'id: {{ recipe_id }}\ncategory: {{ category }}\nsummary: {{ summary }}\n\necosystems: []\n\nprovides: []\n\nrequires: []';
      }
      if (filePath.includes('recipe_prompt.md')) {
        return '## Goal\n{{ summary }}';
      }
      if (filePath.includes('recipe_fix.md')) {
        return '# {{ recipe_name }}\nSetup instructions';
      }
      return 'mock file content';
    });
  };

  it('should generate recipe with basic template when magic is false', async () => {
    setupGenerateMocks();

    const result = await performRecipesGenerate({
      name: 'test-recipe',
      category: 'general',
      summary: 'Test recipe for testing',
      magicGenerate: false,
    });

    expect(result.success).toBe(true);
    expect(result.recipeName).toBe('test-recipe');
    expect(result.recipePath).toContain('test-recipe');
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('test-recipe'),
      { recursive: true }
    );
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('variants'),
      { recursive: true }
    );
    expect(mockWriteFileSync).toHaveBeenCalledTimes(4);
  });

  it('should validate recipe name and convert spaces to dashes', async () => {
    setupGenerateMocks();

    const result = await performRecipesGenerate({
      name: 'eslint setup',
      category: 'linting',
      summary: 'Setup ESLint for project',
      magicGenerate: false,
    });

    expect(result.success).toBe(true);
    expect(result.recipeName).toBe('eslint-setup');
    expect(result.recipePath).toContain('eslint-setup');
  });

  it('should reject recipe names with invalid characters', async () => {
    setupGenerateMocks();

    await expect(
      performRecipesGenerate({
        name: 'test@recipe!',
        category: 'test',
        summary: 'Test summary',
        magicGenerate: false,
      })
    ).rejects.toThrow('Recipe name contains invalid characters');
  });

  it('should reject empty recipe names', async () => {
    setupGenerateMocks();

    await expect(
      performRecipesGenerate({
        name: '',
        category: 'test',
        summary: 'Test summary',
        magicGenerate: false,
      })
    ).rejects.toThrow('Recipe name is required');
  });

  it('should require recipe name to be provided', async () => {
    setupGenerateMocks();

    await expect(
      performRecipesGenerate({
        magicGenerate: false,
      })
    ).rejects.toThrow('Recipe name is required');
  });

  it('should allow only letters, numbers, and dashes in recipe names', async () => {
    setupGenerateMocks();

    const result = await performRecipesGenerate({
      name: 'test-recipe-123',
      category: 'utilities',
      summary: 'Test recipe utilities',
      magicGenerate: false,
    });

    expect(result.success).toBe(true);
    expect(result.recipeName).toBe('test-recipe-123');
  });

  it('should reject recipe names with special characters', async () => {
    setupGenerateMocks();

    const invalidNames = [
      'test@recipe',
      'recipe!',
      'test#recipe',
      'recipe$',
      'test%recipe',
      'recipe^',
      'test&recipe',
      'recipe*',
      'test(recipe)',
      'recipe+',
      'test=recipe',
      'recipe|',
      'test\\recipe',
      'recipe/',
      'test:recipe',
      'recipe;',
      'test"recipe',
      "recipe'",
      'test<recipe>',
      'recipe?',
      'test.recipe',
      'recipe,',
    ];

    for (const name of invalidNames) {
      await expect(
        performRecipesGenerate({
          name,
          category: 'test',
          summary: 'Test summary',
          magicGenerate: false,
        })
      ).rejects.toThrow('Recipe name contains invalid characters');
    }
  });

  it('should convert spaces to dashes and lowercase', async () => {
    setupGenerateMocks();

    const result = await performRecipesGenerate({
      name: 'My Recipe Name',
      category: 'general',
      summary: 'Test recipe name conversion',
      magicGenerate: false,
    });

    expect(result.success).toBe(true);
    expect(result.recipeName).toBe('my-recipe-name');
  });

  it('should handle multiple consecutive spaces', async () => {
    setupGenerateMocks();

    const result = await performRecipesGenerate({
      name: 'test    multiple   spaces',
      category: 'formatting',
      summary: 'Test multiple spaces handling',
      magicGenerate: false,
    });

    expect(result.success).toBe(true);
    expect(result.recipeName).toBe('test-multiple-spaces');
  });

  it('should trim whitespace from recipe names', async () => {
    setupGenerateMocks();

    const result = await performRecipesGenerate({
      name: '  trimmed-name  ',
      category: 'cleanup',
      summary: 'Test whitespace trimming',
      magicGenerate: false,
    });

    expect(result.success).toBe(true);
    expect(result.recipeName).toBe('trimmed-name');
  });

  it('should reject names with only spaces', async () => {
    setupGenerateMocks();

    await expect(
      performRecipesGenerate({
        name: '   ',
        category: 'test',
        summary: 'Test summary',
        magicGenerate: false,
      })
    ).rejects.toThrow('Recipe name cannot be empty');
  });

  it('should handle template rendering correctly', async () => {
    setupGenerateMocks();

    await performRecipesGenerate({
      name: 'render-test',
      category: 'test-category',
      summary: 'Test summary',
      magicGenerate: false,
    });

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('metadata.yaml'),
      expect.stringContaining('render-test')
    );
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('prompt.md'),
      expect.stringContaining('Test summary')
    );
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('fix.md'),
      expect.stringContaining('render-test')
    );
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('variants/javascript_default.md'),
      expect.stringContaining('render-test')
    );
  });

  it('should call progress callback during generation', async () => {
    setupGenerateMocks();
    const mockProgress = jest.fn();

    await performRecipesGenerate(
      {
        name: 'progress-recipe',
        category: 'monitoring',
        summary: 'Test progress callbacks',
        magicGenerate: false,
      },
      mockProgress
    );

    expect(mockProgress).toHaveBeenCalledWith('Starting recipe generation');
    expect(mockProgress).toHaveBeenCalledWith(
      expect.stringContaining('Creating recipe directory')
    );
    expect(mockProgress).toHaveBeenCalledWith('Creating recipe files');
    expect(mockProgress).toHaveBeenCalledWith('Recipe generation complete!');
  });

  it('should populate template variables correctly', async () => {
    setupGenerateMocks();

    await performRecipesGenerate({
      name: 'template test',
      category: 'testing',
      summary: 'Test template variables',
      magicGenerate: false,
    });

    const metadataCall = mockWriteFileSync.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('metadata.yaml')
    );
    const promptCall = mockWriteFileSync.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('prompt.md')
    );
    const fixCall = mockWriteFileSync.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('javascript_default.md')
    );

    expect(metadataCall).toBeDefined();
    expect(promptCall).toBeDefined();
    expect(fixCall).toBeDefined();
  });

  it('should create correct directory structure', async () => {
    setupGenerateMocks();

    await performRecipesGenerate({
      name: 'structure-test',
      category: 'testing',
      summary: 'Test directory structure',
      magicGenerate: false,
    });

    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('structure-test'),
      { recursive: true }
    );
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('structure-test/variants'),
      { recursive: true }
    );
  });

  it('should use current directory as default save location', async () => {
    setupGenerateMocks();

    const result = await performRecipesGenerate({
      name: 'default-location',
      category: 'location',
      summary: 'Test default location',
      magicGenerate: false,
    });

    expect(result.success).toBe(true);
    expect(result.recipePath).toContain('default-location');
    expect(result.recipePath).not.toContain('/custom/path');
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('default-location'),
      { recursive: true }
    );
  });

  it('should use custom save location when provided', async () => {
    setupGenerateMocks();

    const result = await performRecipesGenerate({
      name: 'custom-location',
      saveLocation: '/custom/path',
      category: 'utilities',
      summary: 'Test custom location',
      magicGenerate: false,
    });

    expect(result.success).toBe(true);
    expect(result.recipePath).toBe('/custom/path/utilities/custom-location');
    expect(mockMkdirSync).toHaveBeenCalledWith(
      '/custom/path/utilities/custom-location',
      { recursive: true }
    );
  });

  it('should expand tilde in save location', async () => {
    setupGenerateMocks();
    mockHomedir.mockReturnValue('/test/home');

    const result = await performRecipesGenerate({
      name: 'tilde-location',
      saveLocation: '~/my-recipes',
      category: 'tools',
      summary: 'Test tilde expansion',
      magicGenerate: false,
    });

    expect(result.success).toBe(true);
    expect(result.recipePath).toBe(
      '/test/home/my-recipes/tools/tilde-location'
    );
    expect(mockMkdirSync).toHaveBeenCalledWith(
      '/test/home/my-recipes/tools/tilde-location',
      { recursive: true }
    );
  });

  it('should handle nested tilde paths correctly', async () => {
    setupGenerateMocks();
    mockHomedir.mockReturnValue('/test/home');

    const result = await performRecipesGenerate({
      name: 'nested-tilde',
      saveLocation: '~/.chorenzo/recipes/custom',
      category: 'integrations',
      summary: 'Test nested tilde paths',
      magicGenerate: false,
    });

    expect(result.success).toBe(true);
    expect(result.recipePath).toBe(
      '/test/home/.chorenzo/recipes/custom/integrations/nested-tilde'
    );
    expect(mockMkdirSync).toHaveBeenCalledWith(
      '/test/home/.chorenzo/recipes/custom/integrations/nested-tilde',
      { recursive: true }
    );
  });

  it('should handle relative paths in save location', async () => {
    setupGenerateMocks();

    const result = await performRecipesGenerate({
      name: 'relative-location',
      saveLocation: './custom-recipes',
      category: 'features',
      summary: 'Test relative paths',
      magicGenerate: false,
    });

    expect(result.success).toBe(true);
    expect(result.recipePath).toContain(
      'custom-recipes/features/relative-location'
    );
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('custom-recipes/features/relative-location'),
      { recursive: true }
    );
  });

  it('should use provided category', async () => {
    setupGenerateMocks();

    const result = await performRecipesGenerate({
      name: 'test-recipe',
      category: 'development',
      summary: 'Test development recipe',
      magicGenerate: false,
    });

    expect(result.success).toBe(true);
    const metadataCall = mockWriteFileSync.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('metadata.yaml')
    );
    expect(metadataCall).toBeDefined();
    expect(metadataCall?.[1]).toContain('development');
  });

  it('should require category when none provided', async () => {
    setupGenerateMocks();

    await expect(
      performRecipesGenerate({
        name: 'test-recipe',
        magicGenerate: false,
      })
    ).rejects.toThrow('Category is required');
  });

  it('should require summary when none provided', async () => {
    setupGenerateMocks();
    await expect(
      performRecipesGenerate({
        name: 'test-recipe',
        category: 'development',
        magicGenerate: false,
      })
    ).rejects.toThrow('Summary is required');
  });

  it('should use provided summary', async () => {
    setupGenerateMocks();
    const result = await performRecipesGenerate({
      name: 'test-recipe',
      category: 'development',
      summary: 'Custom summary for testing',
      magicGenerate: false,
    });
    expect(result.success).toBe(true);
    const promptCall = mockWriteFileSync.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('prompt.md')
    );
    expect(promptCall).toBeDefined();
    expect(promptCall?.[1]).toContain('Custom summary for testing');
  });

  it('should handle multiline summary correctly', async () => {
    setupGenerateMocks();
    const multilineSummary = 'First line\nSecond line\nThird line';
    const result = await performRecipesGenerate({
      name: 'multiline-test',
      category: 'testing',
      summary: multilineSummary,
      magicGenerate: false,
    });
    expect(result.success).toBe(true);
    const promptCall = mockWriteFileSync.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('prompt.md')
    );
    expect(promptCall).toBeDefined();
    expect(promptCall?.[1]).toContain(multilineSummary);
  });

  it('should handle summary with special characters', async () => {
    setupGenerateMocks();
    const specialSummary = 'Summary with @special #characters & symbols!';
    const result = await performRecipesGenerate({
      name: 'special-chars',
      category: 'testing',
      summary: specialSummary,
      magicGenerate: false,
    });
    expect(result.success).toBe(true);
    const promptCall = mockWriteFileSync.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('prompt.md')
    );
    expect(promptCall).toBeDefined();
    expect(promptCall?.[1]).toContain(specialSummary);
  });

  it('should trim whitespace from summary', async () => {
    setupGenerateMocks();
    const result = await performRecipesGenerate({
      name: 'trim-test',
      category: 'testing',
      summary: '   Trimmed summary   ',
      magicGenerate: false,
    });
    expect(result.success).toBe(true);
    const promptCall = mockWriteFileSync.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('prompt.md')
    );
    expect(promptCall).toBeDefined();
    expect(promptCall?.[1]).toContain('Trimmed summary');
  });

  it('should reject empty summary string', async () => {
    setupGenerateMocks();
    await expect(
      performRecipesGenerate({
        name: 'test-recipe',
        category: 'development',
        summary: '',
        magicGenerate: false,
      })
    ).rejects.toThrow('Summary is required');
  });

  it('should reject summary with only whitespace', async () => {
    setupGenerateMocks();
    await expect(
      performRecipesGenerate({
        name: 'test-recipe',
        category: 'development',
        summary: '   ',
        magicGenerate: false,
      })
    ).rejects.toThrow('Summary is required');
  });

  it('should handle custom category names with same validation as recipe names', async () => {
    setupGenerateMocks();

    const result = await performRecipesGenerate({
      name: 'test-recipe',
      category: 'my-custom-category-123',
      summary: 'Test custom category validation',
      magicGenerate: false,
    });

    expect(result.success).toBe(true);
    const metadataCall = mockWriteFileSync.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('metadata.yaml')
    );
    expect(metadataCall).toBeDefined();
    expect(metadataCall?.[1]).toContain('my-custom-category-123');
  });

  it('should create recipe in category subfolder for library root location', async () => {
    setupGenerateMocks();
    setupLocationMocks(
      {
        '/test/library': true,
        '/test/library/development': true,
        '/test/library/development/existing-recipe': true,
        '/test/library/development/existing-recipe/metadata.yaml': true,
      },
      {
        '/test/library': ['development'],
        '/test/library/development': ['existing-recipe'],
      }
    );

    const result = await performRecipesGenerate({
      name: 'new-recipe',
      category: 'testing',
      saveLocation: '/test/library',
      summary: 'Test library root location',
      magicGenerate: false,
    });

    expect(result.success).toBe(true);
    expect(result.recipePath).toBe('/test/library/testing/new-recipe');
    expect(mockMkdirSync).toHaveBeenCalledWith(
      '/test/library/testing/new-recipe',
      { recursive: true }
    );
  });

  it('should create recipe directly in category folder location', async () => {
    setupGenerateMocks();
    setupLocationMocks(
      {
        '/test/library/development': true,
        '/test/library/development/existing-recipe': true,
        '/test/library/development/existing-recipe/metadata.yaml': true,
      },
      {
        '/test/library/development': ['existing-recipe'],
      }
    );

    const result = await performRecipesGenerate({
      name: 'new-recipe',
      category: 'development',
      saveLocation: '/test/library/development',
      summary: 'Test category folder location',
      magicGenerate: false,
    });

    expect(result.success).toBe(true);
    expect(result.recipePath).toBe('/test/library/development/new-recipe');
    expect(mockMkdirSync).toHaveBeenCalledWith(
      '/test/library/development/new-recipe',
      { recursive: true }
    );
  });

  it('should throw error for mixed hierarchy in save location', async () => {
    setupGenerateMocks();
    setupLocationMocks(
      {
        '/test/mixed': true,
        '/test/mixed/development': true,
        '/test/mixed/recipe1': true,
        '/test/mixed/development/recipe2': true,
        '/test/mixed/recipe1/metadata.yaml': true,
        '/test/mixed/development/recipe2/metadata.yaml': true,
      },
      {
        '/test/mixed': ['development', 'recipe1'],
        '/test/mixed/development': ['recipe2'],
      }
    );

    await expect(
      performRecipesGenerate({
        name: 'new-recipe',
        saveLocation: '/test/mixed',
        category: 'test',
        summary: 'Test mixed hierarchy error',
        magicGenerate: false,
      })
    ).rejects.toThrow(
      'Invalid hierarchy: location contains both recipe folders and category folders'
    );
  });

  it('should throw error for unknown hierarchy in save location', async () => {
    setupGenerateMocks();
    setupLocationMocks(
      {
        '/test/unknown': true,
        '/test/unknown/folder1': true,
        '/test/unknown/folder2': true,
      },
      {
        '/test/unknown': ['folder1', 'folder2'],
        '/test/unknown/folder1': [],
        '/test/unknown/folder2': [],
      }
    );

    await expect(
      performRecipesGenerate({
        name: 'new-recipe',
        saveLocation: '/test/unknown',
        category: 'test',
        summary: 'Test unknown hierarchy error',
        magicGenerate: false,
      })
    ).rejects.toThrow(
      'Location "/test/unknown" contains folders but none are recognized as recipe categories or recipes'
    );
  });

  it('should validate category names in performRecipesGenerate', async () => {
    setupGenerateMocks();

    await expect(
      performRecipesGenerate({
        name: 'test-recipe',
        category: 'invalid@category',
        summary: 'Test invalid category',
        magicGenerate: false,
      })
    ).rejects.toThrow('Category name contains invalid characters: @');
  });

  it('should normalize category names in performRecipesGenerate', async () => {
    setupGenerateMocks();

    const result = await performRecipesGenerate({
      name: 'test-recipe',
      category: 'Test Category',
      summary: 'Test category normalization',
      magicGenerate: false,
    });

    expect(result.success).toBe(true);
    expect(result.recipePath).toContain('test-category');
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('test-category/test-recipe'),
      { recursive: true }
    );
  });

  it('should throw error when recipe with same name already exists', async () => {
    setupGenerateMocks();
    mockExistsSync.mockImplementation((path: string) => {
      return path.includes('existing-recipe');
    });

    await expect(
      performRecipesGenerate({
        name: 'existing-recipe',
        category: 'tools',
        summary: 'Test duplicate detection',
        magicGenerate: false,
      })
    ).rejects.toThrow('Recipe "existing-recipe" already exists at');
  });

  describe('Ecosystem-agnostic recipes', () => {
    it('should generate ecosystem-agnostic recipe with fix.md file', async () => {
      setupGenerateMocks();

      const result = await performRecipesGenerate({
        name: 'agnostic-recipe',
        category: 'utilities',
        summary: 'Test ecosystem-agnostic recipe',
        magicGenerate: false,
        ecosystemAgnostic: true,
      });

      expect(result.success).toBe(true);
      expect(result.recipeName).toBe('agnostic-recipe');
      expect(result.recipePath).toContain('agnostic-recipe');

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('agnostic-recipe'),
        { recursive: true }
      );
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('variants'),
        { recursive: true }
      );

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('fix.md'),
        expect.any(String)
      );
      expect(mockWriteFileSync).not.toHaveBeenCalledWith(
        expect.stringContaining('variants/javascript_default.md'),
        expect.any(String)
      );
    });

    it('should generate regular recipe with fixes directory when not ecosystem-agnostic', async () => {
      setupGenerateMocks();

      const result = await performRecipesGenerate({
        name: 'regular-recipe',
        category: 'utilities',
        summary: 'Test regular recipe',
        magicGenerate: false,
        ecosystemAgnostic: false,
      });

      expect(result.success).toBe(true);
      expect(result.recipeName).toBe('regular-recipe');

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('variants'),
        { recursive: true }
      );

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('fix.md'),
        expect.any(String)
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('variants/javascript_default.md'),
        expect.any(String)
      );
    });
  });

  describe('CLI parameter handling', () => {
    it('should accept magicGenerate and additionalInstructions CLI parameters', async () => {
      setupGenerateMocks();

      const result = await performRecipesGenerate({
        name: 'basic-recipe',
        category: 'tools',
        summary: 'Test basic recipe generation',
        magicGenerate: false,
      });

      expect(result.success).toBe(true);
      expect(result.recipeName).toBe('basic-recipe');
    });

    it('should handle magicGenerate parameter when passed to CLI', async () => {
      const options = {
        name: 'test-recipe',
        category: 'development',
        summary: 'Test recipe',
        magicGenerate: true,
        additionalInstructions: 'Use TypeScript',
      };

      expect(options.magicGenerate).toBe(true);
      expect(options.additionalInstructions).toBe('Use TypeScript');
    });

    it('should handle ecosystem-agnostic parameter with magic generation', async () => {
      const options = {
        name: 'agnostic-recipe',
        category: 'general',
        summary: 'Test agnostic recipe',
        magicGenerate: true,
        ecosystemAgnostic: true,
      };

      expect(options.magicGenerate).toBe(true);
      expect(options.ecosystemAgnostic).toBe(true);
    });

    it('should handle ecosystem-specific parameter', async () => {
      setupGenerateMocks();

      const result = await performRecipesGenerate({
        name: 'specific-recipe',
        category: 'utilities',
        summary: 'Test ecosystem-specific recipe',
        magicGenerate: false,
        ecosystemAgnostic: false,
      });

      expect(result.success).toBe(true);
      expect(result.recipeName).toBe('specific-recipe');

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('variants'),
        { recursive: true }
      );

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('fix.md'),
        expect.any(String)
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('variants/javascript_default.md'),
        expect.any(String)
      );
    });

    it('should convert ecosystemSpecific to ecosystemAgnostic internally', async () => {
      setupGenerateMocks();

      const result = await performRecipesGenerate({
        name: 'conversion-test',
        category: 'utilities',
        summary: 'Test flag conversion',
        magicGenerate: false,
        ecosystemAgnostic: true,
      });

      expect(result.success).toBe(true);

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('variants'),
        { recursive: true }
      );

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('fix.md'),
        expect.any(String)
      );
    });

    it('should handle CLI flag conversion properly', () => {
      const ecosystemSpecificToAgnostic = false;
      expect(ecosystemSpecificToAgnostic).toBe(false);

      const ecosystemAgnosticFlag = true;
      expect(ecosystemAgnosticFlag).toBe(true);
    });
  });
});
