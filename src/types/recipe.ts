import { parseRecipeFromDirectory, parseRecipeLibraryFromDirectory, validateRecipe } from '../utils/recipe.utils';

export interface RecipeVariant {
  id: string;
  fix_prompt: string;
}

export interface RecipeEcosystem {
  id: string;
  default_variant: string;
  variants: RecipeVariant[];
}

export interface RecipeDependency {
  key: string;
  equals: string;
}

export interface RecipeMetadata {
  id: string;
  category: string;
  summary: string;
  ecosystems: RecipeEcosystem[];
  provides: string[];
  requires: RecipeDependency[];
}

export interface RecipePrompt {
  goal: string;
  investigation: string;
  expectedOutput: string;
}

export interface RecipeValidationError {
  type: 'metadata' | 'prompt' | 'fix' | 'structure';
  message: string;
  field?: string;
  file?: string;
}

export interface RecipeValidationResult {
  valid: boolean;
  errors: RecipeValidationError[];
  warnings: RecipeValidationError[];
}

export class Recipe {
  constructor(
    public readonly path: string,
    public readonly metadata: RecipeMetadata,
    public readonly prompt: RecipePrompt,
    public readonly fixFiles: Map<string, string>
  ) {}

  static async fromDirectory(recipePath: string): Promise<Recipe> {
    return parseRecipeFromDirectory(recipePath);
  }

  validate(): RecipeValidationResult {
    return validateRecipe(this);
  }

  getId(): string {
    return this.metadata.id;
  }

  getCategory(): string {
    return this.metadata.category;
  }

  getSummary(): string {
    return this.metadata.summary;
  }

  getEcosystems(): RecipeEcosystem[] {
    return this.metadata.ecosystems;
  }

  getProvides(): string[] {
    return this.metadata.provides;
  }

  getRequires(): RecipeDependency[] {
    return this.metadata.requires;
  }

  hasEcosystem(ecosystemId: string): boolean {
    return this.metadata.ecosystems.some(eco => eco.id === ecosystemId);
  }

  getVariantsForEcosystem(ecosystemId: string): RecipeVariant[] {
    const ecosystem = this.metadata.ecosystems.find(eco => eco.id === ecosystemId);
    return ecosystem?.variants || [];
  }

  getDefaultVariant(ecosystemId: string): string | undefined {
    const ecosystem = this.metadata.ecosystems.find(eco => eco.id === ecosystemId);
    return ecosystem?.default_variant;
  }
}

export class RecipeLibrary {
  constructor(
    public readonly path: string,
    public readonly recipes: Recipe[]
  ) {}

  static async fromDirectory(libraryPath: string): Promise<RecipeLibrary> {
    return parseRecipeLibraryFromDirectory(libraryPath);
  }

  findRecipeById(id: string): Recipe | undefined {
    return this.recipes.find(recipe => recipe.getId() === id);
  }

  findRecipesByCategory(category: string): Recipe[] {
    return this.recipes.filter(recipe => recipe.getCategory() === category);
  }

  findRecipesByEcosystem(ecosystemId: string): Recipe[] {
    return this.recipes.filter(recipe => recipe.hasEcosystem(ecosystemId));
  }

  validateAll(): Map<string, RecipeValidationResult> {
    const results = new Map<string, RecipeValidationResult>();
    for (const recipe of this.recipes) {
      results.set(recipe.getId(), recipe.validate());
    }
    return results;
  }
}