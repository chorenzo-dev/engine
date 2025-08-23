import {
  parseRecipeFromDirectory,
  parseRecipeLibraryFromDirectory,
  validateRecipe,
} from '~/utils/recipe.utils';

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

export type RecipeLevel =
  | 'workspace-only'
  | 'project-only'
  | 'workspace-preferred';

export interface RecipeMetadata {
  id: string;
  category: string;
  summary: string;
  level: RecipeLevel;
  ecosystems: RecipeEcosystem[];
  provides: string[];
  requires: RecipeDependency[];
}

export interface RecipePrompt {
  goal: string;
  investigation: string;
  expectedOutput: string;
  content: string;
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

export type CodeSampleViolationType =
  | 'generic_placeholder'
  | 'incomplete_fragment'
  | 'abstract_pseudocode'
  | 'overly_simplistic';

export interface CodeSampleViolation {
  file: string;
  line: number;
  type: CodeSampleViolationType;
  description: string;
  suggestion: string;
  codeSnippet: string;
}

export interface CodeSampleValidationSummary {
  totalFiles: number;
  filesWithViolations: number;
  totalViolations: number;
  violationTypes: Record<CodeSampleViolationType, number>;
}

export interface CodeSampleValidationResult {
  valid: boolean;
  violations: CodeSampleViolation[];
  summary: CodeSampleValidationSummary;
}

export interface FileToValidate {
  path: string;
  content: string;
  language?: string;
}

export class Recipe {
  constructor(
    public readonly path: string,
    public readonly metadata: RecipeMetadata,
    public readonly prompt: RecipePrompt,
    public readonly fixFiles: Map<string, string>
  ) {}

  static fromDirectory(recipePath: string): Recipe {
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

  getLevel(): RecipeLevel {
    return this.metadata.level;
  }

  isWorkspaceLevel(): boolean {
    return (
      this.metadata.level === 'workspace-only' ||
      this.metadata.level === 'workspace-preferred'
    );
  }

  isProjectLevel(): boolean {
    return (
      this.metadata.level === 'project-only' ||
      this.metadata.level === 'workspace-preferred'
    );
  }

  isWorkspaceOnly(): boolean {
    return this.metadata.level === 'workspace-only';
  }

  isProjectOnly(): boolean {
    return this.metadata.level === 'project-only';
  }

  isWorkspacePreferred(): boolean {
    return this.metadata.level === 'workspace-preferred';
  }

  isEcosystemAgnostic(): boolean {
    return this.metadata.ecosystems.length === 0;
  }

  hasEcosystem(ecosystemId: string): boolean {
    if (this.metadata.ecosystems.length === 0) {
      return true;
    }
    return this.metadata.ecosystems.some((eco) => eco.id === ecosystemId);
  }

  getVariantsForEcosystem(ecosystemId: string): RecipeVariant[] {
    const ecosystem = this.metadata.ecosystems.find(
      (eco) => eco.id === ecosystemId
    );
    return ecosystem?.variants || [];
  }

  getDefaultVariant(ecosystemId: string): string | undefined {
    const ecosystem = this.metadata.ecosystems.find(
      (eco) => eco.id === ecosystemId
    );
    return ecosystem?.default_variant;
  }

  getPrompt(): RecipePrompt {
    return this.prompt;
  }

  getBaseFixContent(): string | undefined {
    return this.fixFiles.get('fix.md');
  }

  getVariantFixContent(variantName: string): string | undefined {
    return this.fixFiles.get(`variants/${variantName}.md`);
  }

  getEcosystemVariantFixContent(
    ecosystem: string,
    variantName: string
  ): string | undefined {
    return this.fixFiles.get(`variants/${ecosystem}_${variantName}.md`);
  }

  getFixContentForVariant(ecosystem?: string, variantName?: string): string {
    const baseContent = this.getBaseFixContent() || '';

    if (!ecosystem || !variantName) {
      return baseContent;
    }

    const variantContent =
      this.getEcosystemVariantFixContent(ecosystem, variantName) ||
      this.getVariantFixContent(variantName);

    return variantContent ? baseContent + '\n\n' + variantContent : baseContent;
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
    return this.recipes.find((recipe) => recipe.getId() === id);
  }

  findRecipesByCategory(category: string): Recipe[] {
    return this.recipes.filter((recipe) => recipe.getCategory() === category);
  }

  findRecipesByEcosystem(ecosystemId: string): Recipe[] {
    return this.recipes.filter((recipe) => recipe.hasEcosystem(ecosystemId));
  }

  validateAll(): Map<string, RecipeValidationResult> {
    const results = new Map<string, RecipeValidationResult>();
    for (const recipe of this.recipes) {
      results.set(recipe.getId(), recipe.validate());
    }
    return results;
  }
}
