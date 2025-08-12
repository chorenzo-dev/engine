import * as fs from 'fs';
import * as path from 'path';

import {
  Recipe,
  RecipeLibrary,
  RecipeMetadata,
  RecipePrompt,
  RecipeValidationError,
  RecipeValidationResult,
} from '~/types/recipe';

import { isReservedKeyword } from './project-characteristics.utils';
import { readYaml } from './yaml.utils';

export class RecipeParsingError extends Error {
  constructor(
    message: string,
    public readonly recipePath: string
  ) {
    super(message);
    this.name = 'RecipeParsingError';
  }
}

export async function parseRecipeFromDirectory(
  recipePath: string
): Promise<Recipe> {
  if (!fs.existsSync(recipePath)) {
    throw new RecipeParsingError(
      `Recipe directory does not exist: ${recipePath}`,
      recipePath
    );
  }

  if (!fs.statSync(recipePath).isDirectory()) {
    throw new RecipeParsingError(
      `Path is not a directory: ${recipePath}`,
      recipePath
    );
  }

  const metadataPath = path.join(recipePath, 'metadata.yaml');
  const promptPath = path.join(recipePath, 'prompt.md');

  if (!fs.existsSync(metadataPath)) {
    throw new RecipeParsingError(
      `Missing metadata.yaml in recipe: ${recipePath}`,
      recipePath
    );
  }

  if (!fs.existsSync(promptPath)) {
    throw new RecipeParsingError(
      `Missing prompt.md in recipe: ${recipePath}`,
      recipePath
    );
  }

  try {
    const metadata = await parseMetadata(metadataPath);
    const prompt = await parsePrompt(promptPath);
    const fixFiles = await parseFixFiles(recipePath);

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

export async function parseRecipeLibraryFromDirectory(
  libraryPath: string
): Promise<RecipeLibrary> {
  if (!fs.existsSync(libraryPath)) {
    throw new RecipeParsingError(
      `Library directory does not exist: ${libraryPath}`,
      libraryPath
    );
  }

  if (!fs.statSync(libraryPath).isDirectory()) {
    throw new RecipeParsingError(
      `Path is not a directory: ${libraryPath}`,
      libraryPath
    );
  }

  const recipes: Recipe[] = [];
  const errors: string[] = [];

  for (const entry of await findRecipeDirectories(libraryPath)) {
    try {
      const recipe = await parseRecipeFromDirectory(entry);
      recipes.push(recipe);
    } catch (error) {
      errors.push(
        `Failed to parse recipe at ${entry}: ${error instanceof Error ? error.message : String(error)}`
      );
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

async function parseFixFiles(recipePath: string): Promise<Map<string, string>> {
  const fixFiles = new Map<string, string>();

  const baseFixPath = path.join(recipePath, 'fix.md');
  if (!fs.existsSync(baseFixPath)) {
    throw new RecipeParsingError(
      `Missing required fix.md file in recipe: ${recipePath}`,
      recipePath
    );
  }

  const content = fs.readFileSync(baseFixPath, 'utf-8');
  fixFiles.set('fix.md', content);

  const variantsDir = path.join(recipePath, 'variants');
  if (fs.existsSync(variantsDir) && fs.statSync(variantsDir).isDirectory()) {
    const variantFiles = fs.readdirSync(variantsDir);
    for (const file of variantFiles) {
      if (file.endsWith('.md')) {
        const filePath = path.join(variantsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        fixFiles.set(`variants/${file}`, content);
      }
    }
  }

  return fixFiles;
}

function validateMetadata(metadata: unknown, metadataPath: string): void {
  if (!metadata || typeof metadata !== 'object') {
    throw new Error(`Invalid metadata format in ${metadataPath}`);
  }

  const metadataObj = metadata as Record<string, unknown>;
  const requiredFields = [
    'id',
    'category',
    'summary',
    'level',
    'ecosystems',
    'provides',
    'requires',
  ];

  for (const field of requiredFields) {
    if (!metadataObj[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (!Array.isArray(metadataObj['ecosystems'])) {
    throw new Error('ecosystems must be an array');
  }

  if (!Array.isArray(metadataObj['provides'])) {
    throw new Error('provides must be an array');
  }

  if (!Array.isArray(metadataObj['requires'])) {
    throw new Error('requires must be an array');
  }

  const validLevels = ['workspace-only', 'project-only', 'workspace-preferred'];
  if (!validLevels.includes(metadataObj['level'] as string)) {
    throw new Error(`level must be one of: ${validLevels.join(', ')}`);
  }

  for (const ecosystem of metadataObj['ecosystems'] as Array<
    Record<string, unknown>
  >) {
    if (
      !ecosystem['id'] ||
      !ecosystem['default_variant'] ||
      !ecosystem['variants']
    ) {
      throw new Error(`Invalid ecosystem structure`);
    }

    if (!Array.isArray(ecosystem['variants'])) {
      throw new Error('ecosystem.variants must be an array');
    }

    for (const variant of ecosystem['variants']) {
      if (!variant.id || !variant.fix_prompt) {
        throw new Error(`Invalid variant structure`);
      }
    }
  }

  const recipeDir = path.dirname(metadataPath);
  const recipeName = path.basename(recipeDir);
  if (metadataObj['id'] !== recipeName) {
    throw new Error(
      `Recipe ID '${metadataObj['id']}' must match directory name '${recipeName}'`
    );
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
    expectedOutput: sections.get('Expected Output') || '',
    content,
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
    validateMetadata(recipe.metadata, path.join(recipe.path, 'metadata.yaml'));
  } catch (error) {
    errors.push({
      type: 'metadata',
      message: error instanceof Error ? error.message : String(error),
      file: 'metadata.yaml',
    });
  }

  if (recipe.metadata.ecosystems.length > 0) {
    for (const ecosystem of recipe.metadata.ecosystems) {
      for (const variant of ecosystem['variants']) {
        const hasEcosystemVariant = recipe.fixFiles.has(
          `variants/${ecosystem.id}_${variant.id}.md`
        );
        const hasSimpleVariant = recipe.fixFiles.has(
          `variants/${variant.id}.md`
        );

        if (!hasEcosystemVariant && !hasSimpleVariant) {
          warnings.push({
            type: 'fix',
            message: `No variant fix file found for ${ecosystem.id}:${variant.id}. Expected one of: variants/${ecosystem.id}_${variant.id}.md or variants/${variant.id}.md`,
            file: `variants/${ecosystem.id}_${variant.id}.md`,
          });
        }
      }
    }
  }

  const kebabCaseRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  if (!kebabCaseRegex.test(recipe.metadata.id)) {
    warnings.push({
      type: 'metadata',
      message:
        'Recipe ID should use kebab-case (lowercase letters, numbers, and hyphens only)',
      field: 'id',
    });
  }

  if (!kebabCaseRegex.test(recipe.metadata.category)) {
    warnings.push({
      type: 'metadata',
      message:
        'Recipe category should use kebab-case (lowercase letters, numbers, and hyphens only)',
      field: 'category',
    });
  }

  for (const provided of recipe.metadata.provides) {
    if (typeof provided !== 'string') {
      errors.push({
        type: 'metadata',
        message: `Recipe provides list must contain only strings, found object: ${JSON.stringify(provided)}. Use simple string identifiers instead.`,
        field: 'provides',
      });
      continue;
    }

    if (isReservedKeyword(provided)) {
      errors.push({
        type: 'metadata',
        message: `Recipe provides list cannot contain reserved keywords: ${provided}. Reserved keywords (workspace.*, project.*, *.applied) can only be used in requires field.`,
        field: 'provides',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
