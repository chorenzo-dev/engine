import { query } from '@anthropic-ai/claude-code';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  CodeSampleValidationResult,
  CodeSampleViolationType,
  FileToValidate,
  Recipe,
} from '~/types/recipe';
import {
  CodeChangesEventHandlers,
  executeCodeChangesOperation,
} from '~/utils/code-changes-events.utils';
import { chorenzoConfig } from '~/utils/config.utils';
import { cloneRepository } from '~/utils/git-operations.utils';
import { normalizeRepoIdentifier } from '~/utils/git.utils';
import { libraryManager } from '~/utils/library-manager.utils';
import { resolvePath } from '~/utils/path.utils';
import { loadTemplate, renderPrompt } from '~/utils/prompts.utils';
import {
  parseRecipeFromDirectory,
  parseRecipeLibraryFromDirectory,
} from '~/utils/recipe.utils';

import { extractErrorMessage, formatErrorMessage } from '../utils/error.utils';
import { ProgressCallback, RecipesError } from './recipes.shared';

const RECIPE_FIX_FILE_TYPE = 'markdown';
const DEFAULT_AI_MODEL = 'sonnet';

export class CodeSampleValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'CodeSampleValidationError';
  }
}

export async function performCodeSampleValidation(
  recipe: Recipe
): Promise<CodeSampleValidationResult> {
  try {
    const filesToValidate: FileToValidate[] = [];

    for (const [filePath, content] of recipe.fixFiles.entries()) {
      filesToValidate.push({
        path: filePath,
        content,
        language: RECIPE_FIX_FILE_TYPE,
      });
    }

    if (filesToValidate.length === 0) {
      return {
        valid: true,
        violations: [],
        summary: {
          totalFiles: 0,
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
    }

    const validationResult = await validateRecipeFixContent(filesToValidate);
    return validationResult;
  } catch (error) {
    throw new CodeSampleValidationError(
      `Code sample validation failed: ${extractErrorMessage(error)}`,
      'VALIDATION_FAILED'
    );
  }
}

async function validateRecipeFixContent(
  files: FileToValidate[]
): Promise<CodeSampleValidationResult> {
  try {
    const template = loadTemplate('validation/code_sample_validation');
    const prompt = renderPrompt(template, {
      files: files.map((file) => ({
        path: file.path,
        content: file.content,
        language: RECIPE_FIX_FILE_TYPE,
      })),
    });

    let responseText = '';

    const handlers: CodeChangesEventHandlers = {
      onProgress: () => {},
      onThinkingStateChange: () => {},
      onComplete: () => {},
      onError: (error) => {
        throw new CodeSampleValidationError(
          `AI validation failed: ${extractErrorMessage(error)}`,
          'AI_VALIDATION_FAILED'
        );
      },
    };

    const operationStartTime = new Date();
    const operationResult = await executeCodeChangesOperation(
      query({
        prompt,
        options: {
          model: DEFAULT_AI_MODEL,
          allowedTools: [],
          permissionMode: 'bypassPermissions',
        },
      }),
      handlers,
      operationStartTime
    );

    if (!operationResult.success) {
      throw new CodeSampleValidationError(
        operationResult.error || 'AI validation failed',
        'AI_VALIDATION_FAILED'
      );
    }

    responseText = String(operationResult.result || '');
    const validationResult = parseFixContentValidationResponse(responseText);

    return validationResult;
  } catch (error) {
    throw new CodeSampleValidationError(
      `AI validation failed: ${extractErrorMessage(error)}`,
      'AI_VALIDATION_FAILED'
    );
  }
}

function parseFixContentValidationResponse(
  response: string
): CodeSampleValidationResult {
  try {
    let jsonString: string;

    const codeBlockMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch?.[1]) {
      jsonString = codeBlockMatch[1];
    } else {
      const objectMatch = response.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        jsonString = objectMatch[0];
      } else {
        jsonString = response.trim();
      }
    }

    const parsed = JSON.parse(jsonString);

    if (!isValidFixContentValidationResponse(parsed)) {
      throw new Error('Invalid response structure');
    }

    return parsed;
  } catch (error) {
    throw new CodeSampleValidationError(
      `Failed to parse AI validation response: ${extractErrorMessage(error)}`,
      'RESPONSE_PARSE_FAILED'
    );
  }
}

function isValidFixContentValidationResponse(
  obj: unknown
): obj is CodeSampleValidationResult {
  const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object';

  if (!isObject(obj)) {
    return false;
  }

  if (typeof obj['valid'] !== 'boolean') {
    return false;
  }

  if (!Array.isArray(obj['violations'])) {
    return false;
  }

  if (!isObject(obj['summary'])) {
    return false;
  }

  const summary = obj['summary'];
  const requiredSummaryFields = [
    'totalFiles',
    'filesWithViolations',
    'totalViolations',
    'violationTypes',
  ] as const;
  if (!requiredSummaryFields.every((field) => field in summary)) {
    return false;
  }

  const validTypes: Set<CodeSampleViolationType> = new Set([
    'generic_placeholder',
    'incomplete_fragment',
    'abstract_pseudocode',
    'overly_simplistic',
  ]);

  for (const violation of obj['violations']) {
    if (!isObject(violation)) {
      return false;
    }

    const requiredViolationFields = [
      'file',
      'line',
      'type',
      'description',
      'suggestion',
      'codeSnippet',
    ] as const;
    if (!requiredViolationFields.every((field) => field in violation)) {
      return false;
    }

    if (
      typeof violation['type'] !== 'string' ||
      !validTypes.has(violation['type'] as CodeSampleViolationType)
    ) {
      return false;
    }
  }

  return true;
}

export enum InputType {
  RecipeName = 'recipe-name',
  RecipeFolder = 'recipe-folder',
  Library = 'library',
  GitUrl = 'git-url',
}

export type ValidationCallback = (
  type: 'info' | 'success' | 'error' | 'warning',
  message: string
) => void;

export interface ValidateOptions extends Record<string, unknown> {
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

export interface ValidationContext {
  inputType: InputType;
  target: string;
  resolvedPath?: string;
  recipesValidated?: string[];
}

export interface ValidationResult {
  messages: ValidationMessage[];
  summary?: ValidationSummary;
  context: ValidationContext;
}

export async function performRecipesValidate(
  options: ValidateOptions,
  onProgress?: ProgressCallback
): Promise<ValidationResult> {
  if (!options.target) {
    throw new RecipesError(
      'Target parameter is required for validation',
      'MISSING_TARGET'
    );
  }

  const inputType = detectInputType(options.target);
  const resolvedTarget =
    inputType === InputType.RecipeName || inputType === InputType.GitUrl
      ? options.target
      : resolvePath(options.target);
  onProgress?.(`Validating: ${resolvedTarget}`);

  const messages: ValidationMessage[] = [];
  const handleValidation: ValidationCallback = (type, message) => {
    messages.push({ type, text: message });
    onProgress?.(message);
  };

  try {
    const baseContext = {
      inputType,
      target: options.target,
      resolvedPath: resolvedTarget,
    };

    switch (inputType) {
      case InputType.RecipeName:
        return await validateRecipeByName(
          resolvedTarget,
          options,
          baseContext,
          onProgress,
          handleValidation
        );
      case InputType.RecipeFolder:
        return await validateRecipeFolder(
          resolvedTarget,
          options,
          baseContext,
          onProgress,
          handleValidation
        );
      case InputType.Library:
        return await validateLibrary(
          resolvedTarget,
          options,
          baseContext,
          onProgress,
          handleValidation
        );
      case InputType.GitUrl:
        return await validateGitRepository(
          resolvedTarget,
          options,
          baseContext,
          onProgress,
          handleValidation
        );
      default:
        throw new RecipesError(
          `Unknown input type for: ${options.target}`,
          'UNKNOWN_INPUT_TYPE'
        );
    }
  } catch (error) {
    if (error instanceof RecipesError) {
      throw error;
    }
    throw new RecipesError(extractErrorMessage(error), 'VALIDATION_FAILED');
  }
}

function detectInputType(target: string): InputType {
  if (
    target.startsWith('http://') ||
    target.startsWith('https://') ||
    target.includes('.git')
  ) {
    return InputType.GitUrl;
  }

  if (
    target.startsWith('./') ||
    target.startsWith('../') ||
    target.startsWith('/') ||
    target.startsWith('~/')
  ) {
    const resolvedTarget = resolvePath(target);
    if (fs.existsSync(resolvedTarget)) {
      const stat = fs.statSync(resolvedTarget);
      if (stat.isDirectory()) {
        const metadataPath = path.join(resolvedTarget, 'metadata.yaml');
        if (fs.existsSync(metadataPath)) {
          return InputType.RecipeFolder;
        }
        return InputType.Library;
      }
    }
  }

  return InputType.RecipeName;
}

async function findRecipeByName(recipeName: string): Promise<string[]> {
  return await libraryManager.findRecipeByName(recipeName);
}

async function validateRecipeByName(
  recipeName: string,
  options: Record<string, unknown>,
  context: Omit<ValidationContext, 'recipesValidated'>,
  onProgress?: ProgressCallback,
  onValidation?: ValidationCallback
): Promise<ValidationResult> {
  onProgress?.(`Searching for recipe: ${recipeName}`);

  const foundPaths = await findRecipeByName(recipeName);

  if (foundPaths.length === 0) {
    throw new RecipesError(
      `Recipe '${recipeName}' not found in ${chorenzoConfig.recipesDir}`,
      'RECIPE_NOT_FOUND'
    );
  }

  if (foundPaths.length > 1) {
    const pathsList = foundPaths.map((p) => `  - ${p}`).join('\n');
    throw new RecipesError(
      `Multiple recipes named '${recipeName}' found:\n${pathsList}\nPlease specify the full path.`,
      'MULTIPLE_RECIPES_FOUND'
    );
  }

  const recipePath = foundPaths[0];
  if (!recipePath) {
    throw new RecipesError(
      `Recipe path not found for '${recipeName}'`,
      'RECIPE_PATH_NOT_FOUND'
    );
  }

  return validateRecipeFolder(
    recipePath,
    options,
    context,
    onProgress,
    onValidation
  );
}

async function validateRecipeFolder(
  recipePath: string,
  _options: Record<string, unknown>,
  context: Omit<ValidationContext, 'recipesValidated'>,
  onProgress?: ProgressCallback,
  onValidation?: ValidationCallback
): Promise<ValidationResult> {
  onProgress?.(`Validating recipe folder: ${recipePath}`);

  try {
    const recipe = await parseRecipeFromDirectory(recipePath);
    const result = recipe.validate();

    const messages: ValidationMessage[] = [];
    let totalErrors = 0;
    let totalWarnings = 0;

    let codeSampleValidation;
    try {
      codeSampleValidation = await performCodeSampleValidation(recipe);
    } catch (error) {
      const warningMsg = formatErrorMessage(
        'Code sample validation failed',
        error
      );
      messages.push({ type: 'warning', text: warningMsg });
      onValidation?.('warning', warningMsg);
      totalWarnings++;
    }

    const hasCodeSampleViolations =
      codeSampleValidation && codeSampleValidation.violations.length > 0;
    const isOverallValid = result.valid && !hasCodeSampleViolations;

    if (isOverallValid) {
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
        totalErrors++;
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
        totalWarnings++;
      }
    }

    if (hasCodeSampleViolations && codeSampleValidation) {
      const codeSampleHeader = 'Code Sample Issues:';
      messages.push({ type: 'warning', text: codeSampleHeader });
      onValidation?.('warning', codeSampleHeader);

      for (const violation of codeSampleValidation.violations) {
        const violationMsg = `  - ${violation.file}:${violation.line} (${violation.type}): ${violation.description}`;
        messages.push({ type: 'warning', text: violationMsg });
        onValidation?.('warning', violationMsg);
        totalWarnings++;

        if (violation.suggestion) {
          const suggestionMsg = `    Suggestion: ${violation.suggestion}`;
          messages.push({ type: 'info', text: suggestionMsg });
          onValidation?.('info', suggestionMsg);
        }
      }

      const summaryMsg = `  Total code sample violations: ${codeSampleValidation.summary.totalViolations} across ${codeSampleValidation.summary.filesWithViolations} files`;
      messages.push({ type: 'info', text: summaryMsg });
      onValidation?.('info', summaryMsg);
    }

    const summary: ValidationSummary = {
      total: 1,
      valid: isOverallValid ? 1 : 0,
      totalErrors,
      totalWarnings,
    };

    return {
      messages,
      summary,
      context: {
        ...context,
        recipesValidated: [recipe.getId()],
      },
    };
  } catch (error) {
    throw new RecipesError(
      extractErrorMessage(error),
      'RECIPE_VALIDATION_FAILED'
    );
  }
}

async function validateLibrary(
  libraryPath: string,
  _options: Record<string, unknown>,
  context: Omit<ValidationContext, 'recipesValidated'>,
  onProgress?: ProgressCallback,
  onValidation?: ValidationCallback
): Promise<ValidationResult> {
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
      const recipe = library.recipes.find((r) => r.getId() === recipeId);
      let codeSampleValidation;
      if (recipe) {
        try {
          codeSampleValidation = await performCodeSampleValidation(recipe);
        } catch (error) {
          const warningMsg = `${recipeId} code sample validation failed: ${extractErrorMessage(error)}`;
          messages.push({ type: 'warning', text: warningMsg });
          onValidation?.('warning', warningMsg);
          totalWarnings++;
        }
      }

      const hasCodeSampleViolations =
        codeSampleValidation && codeSampleValidation.violations.length > 0;
      const isOverallValid = result.valid && !hasCodeSampleViolations;

      if (isOverallValid) {
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

      if (hasCodeSampleViolations && codeSampleValidation) {
        const codeSampleHeader = `${recipeId} code sample issues:`;
        messages.push({ type: 'warning', text: codeSampleHeader });
        onValidation?.('warning', codeSampleHeader);

        for (const violation of codeSampleValidation.violations) {
          const violationMsg = `  - ${violation.file}:${violation.line} (${violation.type}): ${violation.description}`;
          messages.push({ type: 'warning', text: violationMsg });
          onValidation?.('warning', violationMsg);
          totalWarnings++;
        }
      }
    }

    const summary: ValidationSummary = {
      total: results.size,
      valid: validCount,
      totalErrors,
      totalWarnings,
    };

    const validatedRecipeIds = Array.from(results.keys());

    return {
      messages,
      summary,
      context: {
        ...context,
        recipesValidated: validatedRecipeIds,
      },
    };
  } catch (error) {
    throw new RecipesError(
      extractErrorMessage(error),
      'LIBRARY_VALIDATION_FAILED'
    );
  }
}

async function validateGitRepository(
  gitUrl: string,
  options: Record<string, unknown>,
  context: Omit<ValidationContext, 'recipesValidated'>,
  onProgress?: ProgressCallback,
  onValidation?: ValidationCallback
): Promise<ValidationResult> {
  onProgress?.(`This will clone and validate recipes from: ${gitUrl}`);
  onProgress?.(
    'This will create a temporary directory and may take some time.'
  );

  const repoName = normalizeRepoIdentifier(gitUrl).replace(/[/\\]/g, '-');
  const tempDir = path.join(
    os.tmpdir(),
    `chorenzo-recipes-${repoName}-${Date.now()}`
  );

  try {
    onProgress?.('Cloning repository');
    await cloneRepository(gitUrl, tempDir, 'main');

    onProgress?.('Validating cloned recipes');
    const result = await validateLibrary(
      tempDir,
      options,
      context,
      onProgress,
      onValidation
    );

    return result;
  } catch (error) {
    if (error instanceof RecipesError) {
      throw error;
    }
    throw new RecipesError(
      formatErrorMessage('Failed to validate git repository', error),
      'GIT_VALIDATION_FAILED'
    );
  } finally {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      onProgress?.('Warning: Failed to clean up temporary directory');
    }
  }
}

function validateAndNormalizeName(
  name: string,
  type: 'recipe' | 'category'
): string {
  const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
  const errorCode =
    type === 'recipe' ? 'INVALID_RECIPE_NAME' : 'INVALID_CATEGORY_NAME';

  if (!name || name.trim().length === 0) {
    throw new RecipesError(
      `${capitalizedType} name cannot be empty`,
      errorCode
    );
  }

  const trimmed = name.trim();
  const normalized = trimmed.replace(/\s+/g, '-').toLowerCase();
  const invalidChars = normalized.match(/[^a-zA-Z0-9-]/g);

  if (invalidChars) {
    const uniqueInvalidChars = [...new Set(invalidChars)].join(', ');
    throw new RecipesError(
      `${capitalizedType} name contains invalid characters: ${uniqueInvalidChars}. Only letters, numbers, and dashes are allowed.`,
      errorCode
    );
  }

  return normalized;
}

export function validateRecipeId(recipeName: string): string {
  return validateAndNormalizeName(recipeName, 'recipe');
}

export function validateCategoryName(categoryName: string): string {
  return validateAndNormalizeName(categoryName, 'category');
}
