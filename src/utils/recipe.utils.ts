import * as fs from 'fs';
import * as path from 'path';
import { readYaml } from './yaml.utils';
import { 
  Recipe, 
  RecipeMetadata, 
  RecipePrompt, 
  RecipeValidationError, 
  RecipeValidationResult,
  RecipeLibrary
} from '../types/recipe';

export class RecipeParsingError extends Error {
  constructor(message: string, public readonly recipePath: string) {
    super(message);
    this.name = 'RecipeParsingError';
  }
}

export async function parseRecipeFromDirectory(recipePath: string): Promise<Recipe> {
  if (!fs.existsSync(recipePath)) {
    throw new RecipeParsingError(`Recipe directory does not exist: ${recipePath}`, recipePath);
  }

  if (!fs.statSync(recipePath).isDirectory()) {
    throw new RecipeParsingError(`Path is not a directory: ${recipePath}`, recipePath);
  }

  const metadataPath = path.join(recipePath, 'metadata.yaml');
  const promptPath = path.join(recipePath, 'prompt.md');
  const fixesDir = path.join(recipePath, 'fixes');

  if (!fs.existsSync(metadataPath)) {
    throw new RecipeParsingError(`Missing metadata.yaml in recipe: ${recipePath}`, recipePath);
  }

  if (!fs.existsSync(promptPath)) {
    throw new RecipeParsingError(`Missing prompt.md in recipe: ${recipePath}`, recipePath);
  }

  try {
    const metadata = await parseMetadata(metadataPath);
    const prompt = await parsePrompt(promptPath);
    const fixFiles = await parseFixFiles(fixesDir, metadata);

    return new Recipe(recipePath, metadata, prompt, fixFiles);
  } catch (error) {
    if (error instanceof RecipeParsingError) {
      throw error;
    }
    throw new RecipeParsingError(
      `Failed to parse recipe: ${error instanceof Error ? error.message : String(error)}`,
      recipePath
    );
  }
}

export async function parseRecipeLibraryFromDirectory(libraryPath: string): Promise<RecipeLibrary> {
  if (!fs.existsSync(libraryPath)) {
    throw new RecipeParsingError(`Library directory does not exist: ${libraryPath}`, libraryPath);
  }

  if (!fs.statSync(libraryPath).isDirectory()) {
    throw new RecipeParsingError(`Path is not a directory: ${libraryPath}`, libraryPath);
  }

  const recipes: Recipe[] = [];
  const errors: string[] = [];

  for (const entry of await findRecipeDirectories(libraryPath)) {
    try {
      const recipe = await parseRecipeFromDirectory(entry);
      recipes.push(recipe);
    } catch (error) {
      errors.push(`Failed to parse recipe at ${entry}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (errors.length > 0 && recipes.length === 0) {
    throw new RecipeParsingError(
      `No valid recipes found in library. Errors: ${errors.join(', ')}`,
      libraryPath
    );
  }

  return new RecipeLibrary(libraryPath, recipes);
}

async function parseMetadata(metadataPath: string): Promise<RecipeMetadata> {
  try {
    const metadata = await readYaml<RecipeMetadata>(metadataPath);
    validateMetadata(metadata, metadataPath);
    return metadata;
  } catch (error) {
    throw new RecipeParsingError(
      `Failed to parse metadata.yaml: ${error instanceof Error ? error.message : String(error)}`,
      path.dirname(metadataPath)
    );
  }
}

async function parsePrompt(promptPath: string): Promise<RecipePrompt> {
  try {
    const content = fs.readFileSync(promptPath, 'utf-8');
    return parsePromptContent(content);
  } catch (error) {
    throw new RecipeParsingError(
      `Failed to parse prompt.md: ${error instanceof Error ? error.message : String(error)}`,
      path.dirname(promptPath)
    );
  }
}

async function parseFixFiles(fixesDir: string, metadata: RecipeMetadata): Promise<Map<string, string>> {
  const fixFiles = new Map<string, string>();

  if (!fs.existsSync(fixesDir)) {
    return fixFiles;
  }

  for (const ecosystem of metadata.ecosystems) {
    for (const variant of ecosystem.variants) {
      const fixPath = path.join(fixesDir, variant.fix_prompt);
      if (fs.existsSync(fixPath)) {
        const content = fs.readFileSync(fixPath, 'utf-8');
        fixFiles.set(variant.fix_prompt, content);
      }
    }
  }

  return fixFiles;
}

function validateMetadata(metadata: any, metadataPath: string): void {
  const requiredFields = ['id', 'category', 'summary', 'ecosystems', 'provides', 'requires'];
  
  for (const field of requiredFields) {
    if (!metadata[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (!Array.isArray(metadata.ecosystems)) {
    throw new Error('ecosystems must be an array');
  }

  if (!Array.isArray(metadata.provides)) {
    throw new Error('provides must be an array');
  }

  if (!Array.isArray(metadata.requires)) {
    throw new Error('requires must be an array');
  }

  for (const ecosystem of metadata.ecosystems) {
    if (!ecosystem.id || !ecosystem.default_variant || !ecosystem.variants) {
      throw new Error(`Invalid ecosystem structure`);
    }
    
    if (!Array.isArray(ecosystem.variants)) {
      throw new Error('ecosystem.variants must be an array');
    }

    for (const variant of ecosystem.variants) {
      if (!variant.id || !variant.fix_prompt) {
        throw new Error(`Invalid variant structure`);
      }
    }
  }

  const recipeName = path.basename(path.dirname(metadataPath));
  if (metadata.id !== recipeName) {
    throw new Error(`Recipe ID '${metadata.id}' must match directory name '${recipeName}'`);
  }
}

function parsePromptContent(content: string): RecipePrompt {
  const lines = content.split('\n');
  const sections = new Map<string, string>();
  let currentSection = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentSection) {
        sections.set(currentSection, currentContent.join('\n').trim());
      }
      currentSection = line.substring(3).trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentSection) {
    sections.set(currentSection, currentContent.join('\n').trim());
  }

  const requiredSections = ['Goal', 'Investigation', 'Expected Output'];
  for (const section of requiredSections) {
    if (!sections.has(section)) {
      throw new Error(`Missing required section: ## ${section}`);
    }
  }

  return {
    goal: sections.get('Goal') || '',
    investigation: sections.get('Investigation') || '',
    expectedOutput: sections.get('Expected Output') || ''
  };
}

async function findRecipeDirectories(libraryPath: string): Promise<string[]> {
  const recipeDirectories: string[] = [];
  
  async function searchDirectory(dir: string): Promise<void> {
    const entries = fs.readdirSync(dir);
    
    for (const entry of entries) {
      const entryPath = path.join(dir, entry);
      const stat = fs.statSync(entryPath);
      
      if (stat.isDirectory()) {
        const metadataPath = path.join(entryPath, 'metadata.yaml');
        if (fs.existsSync(metadataPath)) {
          recipeDirectories.push(entryPath);
        } else {
          await searchDirectory(entryPath);
        }
      }
    }
  }
  
  await searchDirectory(libraryPath);
  return recipeDirectories;
}

export function validateRecipe(recipe: Recipe): RecipeValidationResult {
  const errors: RecipeValidationError[] = [];
  const warnings: RecipeValidationError[] = [];

  try {
    validateMetadata(recipe.metadata, recipe.path);
  } catch (error) {
    errors.push({
      type: 'metadata',
      message: error instanceof Error ? error.message : String(error),
      file: 'metadata.yaml'
    });
  }

  for (const ecosystem of recipe.metadata.ecosystems) {
    for (const variant of ecosystem.variants) {
      if (!recipe.fixFiles.has(variant.fix_prompt)) {
        errors.push({
          type: 'fix',
          message: `Missing fix file: ${variant.fix_prompt}`,
          file: variant.fix_prompt
        });
      }
    }
  }

  if (recipe.metadata.id.includes('_')) {
    warnings.push({
      type: 'metadata',
      message: 'Recipe ID should use kebab-case, not snake_case',
      field: 'id'
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}