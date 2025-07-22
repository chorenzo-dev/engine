import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { query } from '@anthropic-ai/claude-code';
import { parseRecipeFromDirectory, parseRecipeLibraryFromDirectory } from '../utils/recipe.utils';
import { cloneRepository } from '../utils/git-operations.utils';
import { normalizeRepoIdentifier } from '../utils/git.utils';
import { performAnalysis } from './analyze';
import { readJson, writeJson } from '../utils/json.utils';
import { readYaml, parseYaml } from '../utils/yaml.utils';
import { loadPrompt, renderPrompt } from '../utils/prompts.utils';
import { workspaceConfig } from '../utils/workspace-config.utils';
import { Logger } from '../utils/logger.utils';
import { ApplyOptions, ApplyRecipeResult, ApplyError, RecipeState, DependencyValidationResult, ExecutionResult, ApplyProgressCallback, ApplyValidationCallback } from '../types/apply';
import { Recipe, RecipeDependency } from '../types/recipe';
import { WorkspaceAnalysis, ProjectAnalysis } from '../types/analysis';

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
    
    const baseContext = {
      inputType,
      target: options.target,
      resolvedPath: resolvedTarget
    };
    
    switch (inputType) {
      case InputType.RecipeName:
        return await validateRecipeByName(resolvedTarget, options, baseContext, onProgress, handleValidation);
      case InputType.RecipeFolder:
        return await validateRecipeFolder(resolvedTarget, options, baseContext, onProgress, handleValidation);
      case InputType.Library:
        return await validateLibrary(resolvedTarget, options, baseContext, onProgress, handleValidation);
      case InputType.GitUrl:
        return await validateGitRepository(resolvedTarget, options, baseContext, onProgress, handleValidation);
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


async function findRecipeByName(recipeName: string): Promise<string[]> {
  const recipePaths: string[] = [];
  
  async function searchDirectory(dir: string): Promise<void> {
    if (!fs.existsSync(dir)) {
      return;
    }
    
    const entries = fs.readdirSync(dir);
    
    for (const entry of entries) {
      const entryPath = path.join(dir, entry);
      const stat = fs.statSync(entryPath);
      
      if (stat.isDirectory()) {
        if (entry === recipeName) {
          const metadataPath = path.join(entryPath, 'metadata.yaml');
          if (fs.existsSync(metadataPath)) {
            recipePaths.push(entryPath);
          }
        } else {
          await searchDirectory(entryPath);
        }
      }
    }
  }
  
  await searchDirectory(RECIPES_DIR);
  return recipePaths;
}

async function validateRecipeByName(recipeName: string, options: RecipesOptions, context: Omit<ValidationContext, 'recipesValidated'>, onProgress?: ProgressCallback, onValidation?: ValidationCallback): Promise<ValidationResult> {
  onProgress?.(`Searching for recipe: ${recipeName}`);
  
  const foundPaths = await findRecipeByName(recipeName);
  
  if (foundPaths.length === 0) {
    throw new RecipesError(`Recipe '${recipeName}' not found in ~/.chorenzo/recipes`, 'RECIPE_NOT_FOUND');
  }
  
  if (foundPaths.length > 1) {
    const pathsList = foundPaths.map(p => `  - ${p}`).join('\n');
    throw new RecipesError(
      `Multiple recipes named '${recipeName}' found:\n${pathsList}\nPlease specify the full path.`,
      'MULTIPLE_RECIPES_FOUND'
    );
  }
  
  return validateRecipeFolder(foundPaths[0], options, context, onProgress, onValidation);
}

async function validateRecipeFolder(recipePath: string, options: RecipesOptions, context: Omit<ValidationContext, 'recipesValidated'>, onProgress?: ProgressCallback, onValidation?: ValidationCallback): Promise<ValidationResult> {
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
    
    return { 
      messages,
      context: {
        ...context,
        recipesValidated: [recipe.getId()]
      }
    };
  } catch (error) {
    throw new RecipesError(
      `Failed to validate recipe folder: ${error instanceof Error ? error.message : String(error)}`,
      'RECIPE_VALIDATION_FAILED'
    );
  }
}

async function validateLibrary(libraryPath: string, options: RecipesOptions, context: Omit<ValidationContext, 'recipesValidated'>, onProgress?: ProgressCallback, onValidation?: ValidationCallback): Promise<ValidationResult> {
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
    
    const validatedRecipeIds = Array.from(results.keys());
    
    return { 
      messages, 
      summary,
      context: {
        ...context,
        recipesValidated: validatedRecipeIds
      }
    };
  } catch (error) {
    throw new RecipesError(
      `Failed to validate library: ${error instanceof Error ? error.message : String(error)}`,
      'LIBRARY_VALIDATION_FAILED'
    );
  }
}

async function validateGitRepository(gitUrl: string, options: RecipesOptions, context: Omit<ValidationContext, 'recipesValidated'>, onProgress?: ProgressCallback, onValidation?: ValidationCallback): Promise<ValidationResult> {
  onProgress?.(`This will clone and validate recipes from: ${gitUrl}`);
  onProgress?.('This will create a temporary directory and may take some time.');
  
  const repoName = normalizeRepoIdentifier(gitUrl).replace(/[\/\\]/g, '-');
  const tempDir = path.join(os.tmpdir(), `chorenzo-recipes-${repoName}-${Date.now()}`);
  
  try {
    onProgress?.('Cloning repository...');
    await cloneRepository(gitUrl, tempDir, 'main');
    
    onProgress?.('Validating cloned recipes...');
    const result = await validateLibrary(tempDir, options, context, onProgress, onValidation);
    
    return result;
  } catch (error) {
    if (error instanceof RecipesError) {
      throw error;
    }
    throw new RecipesError(
      `Failed to validate git repository: ${error instanceof Error ? error.message : String(error)}`,
      'GIT_VALIDATION_FAILED'
    );
  } finally {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (cleanupError) {
      onProgress?.('Warning: Failed to clean up temporary directory');
    }
  }
}

export async function performRecipesApply(
  options: ApplyOptions,
  onProgress?: ApplyProgressCallback,
  onValidation?: ApplyValidationCallback
): Promise<ApplyRecipeResult> {
  const startTime = new Date();
  const startTimeIso = startTime.toISOString();
  let totalCostUsd = 0;
  
  try {
    onProgress?.('Loading recipe...');
    const recipe = await loadRecipe(options.recipe);
    
    onProgress?.('Validating recipe structure...');
    const validationResult = recipe.validate();
    if (!validationResult.valid) {
      const errors = validationResult.errors.map(e => e.message).join(', ');
      throw new ApplyError(`Recipe validation failed: ${errors}`, 'RECIPE_INVALID');
    }

    onProgress?.('Ensuring analysis data...');
    const analysis = await ensureAnalysisData();

    onProgress?.('Checking recipe dependencies...');
    const currentState = await readCurrentState();
    const dependencyCheck = validateDependencies(recipe, currentState);
    
    if (!dependencyCheck.satisfied) {
      const errorMsg = formatDependencyError(recipe.getId(), dependencyCheck, currentState);
      throw new ApplyError(errorMsg, 'DEPENDENCIES_NOT_SATISFIED');
    }

    onProgress?.('Filtering applicable projects...');
    const applicableProjects = filterApplicableProjects(analysis, recipe, options.project);
    
    if (applicableProjects.length === 0) {
      throw new ApplyError(
        `No applicable projects found for recipe '${recipe.getId()}'`,
        'NO_APPLICABLE_PROJECTS'
      );
    }

    onProgress?.('Applying recipe...');
    const executionResults: ExecutionResult[] = [];
    for (const project of applicableProjects) {
      const variant = options.variant || recipe.getDefaultVariant(project.ecosystem || 'unknown') || 'default';
      const executionResult = await applyRecipeDirectly(recipe, project, variant, analysis);
      
      totalCostUsd += executionResult.costUsd;
      executionResults.push(executionResult);
      
      if (executionResult.success) {
        onValidation?.('success', `Successfully applied to ${executionResult.projectPath}`);
        if (executionResult.outputs) {
          await updateState(recipe.getId(), executionResult.outputs);
        }
      } else {
        onValidation?.('error', `Failed to apply to ${executionResult.projectPath}: ${executionResult.error}`);
      }
    }

    const endTime = new Date();
    const endTimeIso = endTime.toISOString();
    const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;

    const summary = {
      totalProjects: applicableProjects.length,
      successfulProjects: executionResults.filter(e => e.success).length,
      failedProjects: executionResults.filter(e => !e.success).length,
      skippedProjects: 0
    };

    Logger.info({
      event: 'apply_completed',
      duration: durationSeconds,
      totalCost: totalCostUsd,
      summary
    }, 'Recipe application completed');

    return {
      recipe,
      dependencyCheck,
      executionResults,
      stateUpdated: executionResults.some(e => e.success && e.outputs),
      summary,
      metadata: {
        durationSeconds,
        costUsd: totalCostUsd,
        startTime: startTimeIso,
        endTime: endTimeIso,
        type: 'result',
        subtype: 'success'
      }
    };

  } catch (error) {
    try {
      Logger.error({
        event: 'apply_error',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, 'Recipe application failed');
    } catch (loggerError) {

    }
    
    if (error instanceof ApplyError) {
      throw error;
    }
    throw new ApplyError(
      `Apply operation failed: ${error instanceof Error ? error.message : String(error)}`,
      'APPLY_FAILED'
    );
  }
}

async function loadRecipe(recipeName: string): Promise<Recipe> {
  const resolvedTarget = resolvePath(recipeName);
  const inputType = detectInputType(resolvedTarget);
  
  switch (inputType) {
    case InputType.RecipeName:
      const foundPaths = await findRecipeByName(resolvedTarget);
      if (foundPaths.length === 0) {
        throw new ApplyError(`Recipe '${recipeName}' not found in ~/.chorenzo/recipes`, 'RECIPE_NOT_FOUND');
      }
      if (foundPaths.length > 1) {
        const pathsList = foundPaths.map(p => `  - ${p}`).join('\n');
        throw new ApplyError(
          `Multiple recipes named '${recipeName}' found:\n${pathsList}\nPlease specify the full path.`,
          'MULTIPLE_RECIPES_FOUND'
        );
      }
      return await parseRecipeFromDirectory(foundPaths[0]);
      
    case InputType.RecipeFolder:
      if (!fs.existsSync(resolvedTarget)) {
        throw new ApplyError(`Recipe folder does not exist: ${resolvedTarget}`, 'RECIPE_NOT_FOUND');
      }
      return await parseRecipeFromDirectory(resolvedTarget);
      
    default:
      throw new ApplyError(`Invalid recipe target: ${recipeName}`, 'INVALID_RECIPE_TARGET');
  }
}

async function ensureAnalysisData(): Promise<WorkspaceAnalysis> {
  const analysisPath = workspaceConfig.getAnalysisPath();
  
  if (fs.existsSync(analysisPath)) {
    try {
      return await readJson(analysisPath);
    } catch (error) {
      Logger.warn({ 
        event: 'analysis_file_read_failed',
        error: error instanceof Error ? error.message : String(error) 
      }, `Failed to read analysis file`);
      Logger.info({ event: 'regenerating_analysis' }, 'Regenerating analysis');
    }
  }
  
  const analysisResult = await performAnalysis();
  if (!analysisResult.analysis) {
    throw new ApplyError(
      `Analysis failed: ${analysisResult.metadata?.error || 'Unknown error'}`,
      'ANALYSIS_FAILED'
    );
  }
  
  return analysisResult.analysis;
}

async function readCurrentState(): Promise<RecipeState> {
  const statePath = workspaceConfig.getStatePath();
  
  if (!fs.existsSync(statePath)) {
    return {};
  }

  try {
    const rawState = await readJson(statePath);
    return rawState as RecipeState || {};
  } catch (error) {
    throw new ApplyError(`Failed to read state file: ${error instanceof Error ? error.message : String(error)}`, 'STATE_READ_FAILED');
  }
}

function validateDependencies(recipe: Recipe, currentState: RecipeState): DependencyValidationResult {
  const missing: RecipeDependency[] = [];
  const conflicting: Array<{ key: string; required: string; current: string }> = [];

  for (const dependency of recipe.getRequires()) {
    const stateValue = currentState[dependency.key];
    
    if (stateValue === undefined) {
      missing.push(dependency);
    } else {
      const currentValue = String(stateValue);
      if (currentValue !== dependency.equals) {
        conflicting.push({
          key: dependency.key,
          required: dependency.equals,
          current: currentValue
        });
      }
    }
  }

  return {
    satisfied: missing.length === 0 && conflicting.length === 0,
    missing,
    conflicting
  };
}

function formatDependencyError(recipeId: string, validationResult: DependencyValidationResult, currentState: RecipeState): string {
  const lines = [`Recipe '${recipeId}' has unsatisfied dependencies:`];

  for (const dep of validationResult.missing) {
    const currentValue = currentState[dep.key] ?? 'undefined';
    lines.push(`  - ${dep.key} = ${dep.equals} (currently: ${currentValue})`);
  }

  for (const conflict of validationResult.conflicting) {
    lines.push(`  - ${conflict.key} = ${conflict.required} (currently: ${conflict.current})`);
  }

  lines.push('');
  lines.push('Consider running prerequisite recipes first.');

  return lines.join('\n');
}

function filterApplicableProjects(analysis: WorkspaceAnalysis, recipe: Recipe, projectFilter?: string): ProjectAnalysis[] {
  let projects = analysis.projects;
  
  if (projectFilter) {
    projects = projects.filter(p => p.path === projectFilter || p.path.includes(projectFilter));
  }
  
  return projects.filter(project => {
    if (!project.ecosystem) return false;
    return recipe.hasEcosystem(project.ecosystem);
  });
}

async function applyRecipeDirectly(recipe: Recipe, project: ProjectAnalysis, variant: string, analysis: WorkspaceAnalysis): Promise<ExecutionResult> {
  const projectPath = project.path === '.' ? 'workspace' : project.path;
  const workspaceRoot = workspaceConfig.getWorkspaceRoot();
  
  Logger.info({
    event: 'recipe_application_started',
    recipe: recipe.getId(),
    project: project.path,
    variant
  }, 'Starting direct recipe application');

  try {
    const ecosystem = recipe.getEcosystems().find(eco => eco.id === project.ecosystem);
    if (!ecosystem) {
      Logger.warn({
        event: 'ecosystem_not_supported',
        ecosystem: project.ecosystem,
        recipe: recipe.getId()
      }, `Recipe does not support ecosystem: ${project.ecosystem}`);
      return {
        projectPath,
        recipeId: recipe.getId(),
        success: false,
        error: `Recipe '${recipe.getId()}' does not support ecosystem '${project.ecosystem}'`,
        costUsd: 0
      };
    }

    const variants = recipe.getVariantsForEcosystem(project.ecosystem || 'unknown');
    const variantObj = variants.find(v => v.id === variant);
    
    if (!variantObj) {
      Logger.warn({
        event: 'variant_not_found',
        ecosystem: project.ecosystem,
        variant,
        recipe: recipe.getId()
      }, `Variant '${variant}' not found for ecosystem ${project.ecosystem}`);
      return {
        projectPath,
        recipeId: recipe.getId(),
        success: false,
        error: `Variant '${variant}' not found for ecosystem '${project.ecosystem}'`,
        costUsd: 0
      };
    }

    const fixContent = variantObj.fix_prompt;

    const logPath = workspaceConfig.getLogPath();
    
    const promptTemplate = loadPrompt('apply_recipe');
    const applicationPrompt = renderPrompt(promptTemplate, {
      recipe_id: recipe.getId(),
      project_path: project.path,
      recipe_summary: recipe.getSummary(),
      project_type: project.type || 'unknown',
      project_language: project.language || 'unknown',
      project_framework: project.framework || 'unknown',
      project_ecosystem: project.ecosystem || 'unknown',
      workspace_root: workspaceRoot,
      is_monorepo: analysis.isMonorepo ? 'true' : 'false',
      package_manager: project.hasPackageManager ? 'detected' : 'none',
      recipe_variant: variant,
      fix_content: fixContent,
      recipe_provides: recipe.getProvides().join(', ')
    });
    
    Logger.debug({
      event: 'claude_execution_start',
      prompt_length: applicationPrompt.length
    }, 'Starting Claude execution for direct recipe application');

    let executionCost = 0;
    let executionLog = '';
    let success = false;
    
    for await (const message of query({
      prompt: applicationPrompt,
      options: {
        model: 'sonnet',
        allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'MultiEdit', 'LS', 'Glob', 'Grep'],
        permissionMode: 'bypassPermissions',
      },
    })) {
      if (message.type === 'result') {
        if ('total_cost_usd' in message) {
          executionCost = message.total_cost_usd;
        }
        if (message.subtype === 'success' && 'result' in message) {
          executionLog = message.result;
          success = true;
        }
        break;
      }
    }

    Logger.info({ 
      event: 'claude_execution_completed'
    }, 'Claude execution query completed');

    if (!success) {
      Logger.error({ 
        event: 'recipe_application_failed',
        error: 'Claude execution did not complete successfully'
      }, 'Recipe application failed');
      return {
        projectPath,
        recipeId: recipe.getId(),
        success: false,
        error: 'Recipe application failed during execution',
        costUsd: executionCost
      };
    }

    const providesMap = buildProvidesMap(recipe, variant);
    const outputs = extractOutputsFromResult(executionLog, providesMap);
    
    Logger.info({ 
      event: 'recipe_application_completed',
      outputCount: Object.keys(outputs).length
    }, 'Recipe application completed successfully');

    return {
      projectPath,
      recipeId: recipe.getId(),
      success: true,
      costUsd: executionCost,
      outputs
    };

  } catch (error) {
    Logger.error({
      event: 'recipe_application_error',
      error: error instanceof Error ? error.message : String(error)
    }, 'Error during recipe application');
    
    return {
      projectPath,
      recipeId: recipe.getId(),
      success: false,
      error: error instanceof Error ? error.message : String(error),
      costUsd: 0
    };
  }
}

function buildProvidesMap(recipe: Recipe, variant: string): Record<string, string | boolean> {
  const providesMap: Record<string, string | boolean> = {};
  
  for (const key of recipe.getProvides()) {
    if (key.endsWith('.variant')) {
      providesMap[key] = variant;
    } else if (key.endsWith('.legacy_support')) {
      providesMap[key] = false;
    } else {
      providesMap[key] = true;
    }
  }
  
  return providesMap;
}

function extractOutputsFromResult(executionLog: string, expectedOutputs: Record<string, string | boolean>): Record<string, string | boolean> {
  const outputs: Record<string, string | boolean> = {};
  
  for (const [key, expectedValue] of Object.entries(expectedOutputs)) {
    outputs[key] = expectedValue;
  }
  
  return outputs;
}


async function updateState(recipeId: string, outputs: Record<string, string | boolean>): Promise<void> {
  const currentState = await readCurrentState();
  const statePath = workspaceConfig.getStatePath();

  Object.assign(currentState, outputs);

  workspaceConfig.ensureChorenzoDir();
  await writeJson(statePath, currentState);
}