import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseRecipeFromDirectory, parseRecipeLibraryFromDirectory } from '../utils/recipe.utils';

const CHORENZO_DIR = path.join(os.homedir(), '.chorenzo');
const RECIPES_DIR = path.join(CHORENZO_DIR, 'recipes');

export enum InputType {
  RecipeName = 'recipe-name',
  RecipeFolder = 'recipe-folder',
  Library = 'library',
  GitUrl = 'git-url'
}

export type ProgressCallback = (step: string) => void;
export type ValidationCallback = (type: 'info' | 'success' | 'error' | 'warning', message: string) => void;

export interface RecipesOptions {
  progress?: boolean;
}

export interface ValidateOptions extends RecipesOptions {
  target: string;
}

export interface ValidationMessage {
  type: 'info' | 'success' | 'error' | 'warning';
  text: string;
}

export interface ValidationSummary {
  total: number;
  valid: number;
  totalErrors: number;
  totalWarnings: number;
}

export interface ValidationResult {
  messages: ValidationMessage[];
  summary?: ValidationSummary;
}

export class RecipesError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'RecipesError';
  }
}

export async function performRecipesValidate(options: ValidateOptions, onProgress?: ProgressCallback, onValidation?: ValidationCallback): Promise<ValidationResult> {
  if (!options.target) {
    throw new RecipesError('Target parameter is required for validation', 'MISSING_TARGET');
  }

  const resolvedTarget = resolvePath(options.target);
  onProgress?.(`Validating: ${resolvedTarget}`);
  
  const messages: ValidationMessage[] = [];
  const handleValidation: ValidationCallback = (type, message) => {
    messages.push({ type, text: message });
    onValidation?.(type, message);
  };
  
  try {
    const inputType = detectInputType(resolvedTarget);
    
    switch (inputType) {
      case InputType.RecipeName:
        return await validateRecipeByName(resolvedTarget, options, onProgress, handleValidation);
      case InputType.RecipeFolder:
        return await validateRecipeFolder(resolvedTarget, options, onProgress, handleValidation);
      case InputType.Library:
        return await validateLibrary(resolvedTarget, options, onProgress, handleValidation);
      case InputType.GitUrl:
        return await validateGitRepository(resolvedTarget, options, onProgress, handleValidation);
      default:
        throw new RecipesError(`Unknown input type for: ${options.target}`, 'UNKNOWN_INPUT_TYPE');
    }
  } catch (error) {
    if (error instanceof RecipesError) {
      throw error;
    }
    throw new RecipesError(
      `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
      'VALIDATION_FAILED'
    );
  }
}

function resolvePath(target: string): string {
  if (target.startsWith('~/')) {
    return path.join(os.homedir(), target.slice(2));
  }
  return target;
}

function detectInputType(target: string): InputType {
  if (target.startsWith('http://') || target.startsWith('https://') || target.includes('.git')) {
    return InputType.GitUrl;
  }
  
  if (target.startsWith('./') || target.startsWith('../') || target.startsWith('/')) {
    if (fs.existsSync(target)) {
      const stat = fs.statSync(target);
      if (stat.isDirectory()) {
        const metadataPath = path.join(target, 'metadata.yaml');
        if (fs.existsSync(metadataPath)) {
          return InputType.RecipeFolder;
        }
        return InputType.Library;
      }
    }
  }
  
  return InputType.RecipeName;
}

async function validateRecipeByName(recipeName: string, options: RecipesOptions, onProgress?: ProgressCallback, onValidation?: ValidationCallback): Promise<ValidationResult> {
  throw new RecipesError('Recipe name validation not implemented yet', 'NOT_IMPLEMENTED');
}

async function validateRecipeFolder(recipePath: string, options: RecipesOptions, onProgress?: ProgressCallback, onValidation?: ValidationCallback): Promise<ValidationResult> {
  onProgress?.(`Validating recipe folder: ${recipePath}`);
  
  try {
    const recipe = await parseRecipeFromDirectory(recipePath);
    const result = recipe.validate();
    
    const messages: ValidationMessage[] = [];
    
    if (result.valid) {
      const msg = `Recipe '${recipe.getId()}' is valid`;
      messages.push({ type: 'success', text: msg });
      onValidation?.('success', msg);
    } else {
      const headerMsg = `Recipe '${recipe.getId()}' has validation errors:`;
      messages.push({ type: 'error', text: headerMsg });
      onValidation?.('error', headerMsg);
      
      for (const error of result.errors) {
        const errorMsg = `  - ${error.message}${error.file ? ` (${error.file})` : ''}`;
        messages.push({ type: 'error', text: errorMsg });
        onValidation?.('error', errorMsg);
      }
    }
    
    if (result.warnings.length > 0) {
      const warningHeader = 'Warnings:';
      messages.push({ type: 'warning', text: warningHeader });
      onValidation?.('warning', warningHeader);
      
      for (const warning of result.warnings) {
        const warningMsg = `  - ${warning.message}${warning.file ? ` (${warning.file})` : ''}`;
        messages.push({ type: 'warning', text: warningMsg });
        onValidation?.('warning', warningMsg);
      }
    }
    
    return { messages };
  } catch (error) {
    throw new RecipesError(
      `Failed to validate recipe folder: ${error instanceof Error ? error.message : String(error)}`,
      'RECIPE_VALIDATION_FAILED'
    );
  }
}

async function validateLibrary(libraryPath: string, options: RecipesOptions, onProgress?: ProgressCallback, onValidation?: ValidationCallback): Promise<ValidationResult> {
  onProgress?.(`This will validate all recipes in the library: ${libraryPath}`);
  onProgress?.('This may take some time for large libraries.');
  
  try {
    const library = await parseRecipeLibraryFromDirectory(libraryPath);
    const results = library.validateAll();
    
    const messages: ValidationMessage[] = [];
    let validCount = 0;
    let totalErrors = 0;
    let totalWarnings = 0;
    
    for (const [recipeId, result] of results) {
      if (result.valid) {
        validCount++;
        messages.push({ type: 'success', text: recipeId });
        onValidation?.('success', recipeId);
      } else {
        const headerMsg = `${recipeId}:`;
        messages.push({ type: 'error', text: headerMsg });
        onValidation?.('error', headerMsg);
        
        for (const error of result.errors) {
          const errorMsg = `  - ${error.message}${error.file ? ` (${error.file})` : ''}`;
          messages.push({ type: 'error', text: errorMsg });
          onValidation?.('error', errorMsg);
          totalErrors++;
        }
      }
      
      if (result.warnings.length > 0) {
        const warningHeader = `${recipeId} warnings:`;
        messages.push({ type: 'warning', text: warningHeader });
        onValidation?.('warning', warningHeader);
        
        for (const warning of result.warnings) {
          const warningMsg = `  - ${warning.message}${warning.file ? ` (${warning.file})` : ''}`;
          messages.push({ type: 'warning', text: warningMsg });
          onValidation?.('warning', warningMsg);
          totalWarnings++;
        }
      }
    }
    
    const summary: ValidationSummary = {
      total: results.size,
      valid: validCount,
      totalErrors,
      totalWarnings
    };
    
    return { messages, summary };
  } catch (error) {
    throw new RecipesError(
      `Failed to validate library: ${error instanceof Error ? error.message : String(error)}`,
      'LIBRARY_VALIDATION_FAILED'
    );
  }
}

async function validateGitRepository(gitUrl: string, options: RecipesOptions, onProgress?: ProgressCallback, onValidation?: ValidationCallback): Promise<ValidationResult> {
  onProgress?.(`This will clone and validate recipes from: ${gitUrl}`);
  onProgress?.('This will create a temporary directory and may take some time.');
  
  throw new RecipesError('Git repository validation not implemented yet', 'NOT_IMPLEMENTED');
}