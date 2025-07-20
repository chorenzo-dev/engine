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
import { ApplyOptions, ApplyResult, ApplyError, RecipeState, StateEntry, DependencyValidationResult, PlanResult, ExecutionResult, ApplyProgressCallback, ApplyValidationCallback } from '../types/apply';
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
): Promise<ApplyResult> {
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

    onProgress?.('Generating plans...');
    const planResults: PlanResult[] = [];
    for (const project of applicableProjects) {
      const variant = options.variant || recipe.getDefaultVariant(project.ecosystem || 'unknown') || 'default';
      const planResult = await generatePlan(recipe, project, variant, analysis);
      
      if (!planResult.success) {
        throw new ApplyError(
          `Failed to generate plan for ${project.path}: ${planResult.error}`,
          'PLAN_GENERATION_FAILED'
        );
      }
      
      planResults.push(planResult);
      onValidation?.('success', `Plan generated for ${planResult.projectPath}`);
    }

    onProgress?.('Executing plans...');
    const executionResults: ExecutionResult[] = [];
    for (const planResult of planResults) {
      const executionResult = await executePlan(planResult);
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

    const summary = {
      totalProjects: planResults.length,
      successfulProjects: executionResults.filter(e => e.success).length,
      failedProjects: executionResults.filter(e => !e.success).length,
      skippedProjects: 0 // No skipped projects since we fail fast on plan generation
    };

    return {
      recipe,
      dependencyCheck,
      planResults,
      executionResults,
      stateUpdated: executionResults.some(e => e.success && e.outputs),
      summary
    };

  } catch (error) {
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
  const analysisPath = await workspaceConfig.getAnalysisPath();
  
  if (fs.existsSync(analysisPath)) {
    try {
      return await readJson(analysisPath);
    } catch (error) {
      // Analysis file exists but is corrupted or unreadable
      console.warn(`Failed to read analysis file: ${error instanceof Error ? error.message : String(error)}`);
      console.warn('Regenerating analysis...');
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
  const statePath = await workspaceConfig.getStatePath();
  
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
    const stateEntry = currentState[dependency.key];
    
    if (!stateEntry) {
      missing.push(dependency);
    } else {
      const currentValue = String(stateEntry.value);
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
    const currentValue = currentState[dep.key]?.value || 'undefined';
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

async function generatePlan(recipe: Recipe, project: ProjectAnalysis, variant: string, analysis: WorkspaceAnalysis): Promise<PlanResult> {
  const projectPath = project.path === '.' ? 'workspace' : project.path;
  const planPath = await workspaceConfig.getPlanPath(project.path, recipe.getId());
  const workspaceRoot = await workspaceConfig.getWorkspaceRoot();

  try {
    const ecosystem = recipe.getEcosystems().find(eco => eco.id === project.ecosystem);
    if (!ecosystem) {
      return {
        projectPath,
        recipeId: recipe.getId(),
        variant,
        planContent: '',
        planPath,
        success: false,
        error: `Recipe '${recipe.getId()}' does not support ecosystem '${project.ecosystem}'`
      };
    }

    const variantObj = ecosystem.variants.find(v => v.id === variant);
    if (!variantObj) {
      return {
        projectPath,
        recipeId: recipe.getId(),
        variant,
        planContent: '',
        planPath,
        success: false,
        error: `Variant '${variant}' not found for ecosystem '${project.ecosystem}'`
      };
    }

    const promptTemplate = loadPrompt('generate_plan');
    const providesYaml = recipe.getProvides()
      .map(key => `    ${key}: true`)
      .join('\n');
    
    const prompt = renderPrompt(promptTemplate, {
      project_path: project.path,
      project_type: project.type,
      project_language: project.language,
      project_framework: project.framework || 'none',
      project_dependencies: project.dependencies.join(', '),
      project_ecosystem: project.ecosystem || 'unknown',
      workspace_root: workspaceRoot,
      is_monorepo: analysis.isMonorepo.toString(),
      package_manager: project.hasPackageManager ? 'detected' : 'none',
      recipe_id: recipe.getId(),
      recipe_summary: recipe.getSummary(),
      recipe_provides: providesYaml,
      recipe_variant: variant,
      fix_content: variantObj.fix_prompt
    });

    let planContent = '';
    let errorMessage: string | undefined;

    for await (const message of query({
      prompt,
      options: {
        model: 'sonnet',
        maxTurns: 5,
        allowedTools: ['Read', 'LS', 'Glob', 'Grep'],
        permissionMode: 'bypassPermissions',
      },
    })) {
      if (message.type === 'result') {
        if (message.subtype === 'success' && 'result' in message) {
          planContent = message.result;
        } else {
          errorMessage = 'Plan generation failed';
        }
        break;
      }
    }

    if (errorMessage) {
      return {
        projectPath,
        recipeId: recipe.getId(),
        variant,
        planContent: '',
        planPath,
        success: false,
        error: errorMessage
      };
    }

    if (!planContent || planContent.trim() === '') {
      return {
        projectPath,
        recipeId: recipe.getId(),
        variant,
        planContent: '',
        planPath,
        success: false,
        error: 'Plan generation returned empty content'
      };
    }

    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, planContent, 'utf8');

    return {
      projectPath,
      recipeId: recipe.getId(),
      variant,
      planContent,
      planPath,
      success: true
    };

  } catch (error) {
    return {
      projectPath,
      recipeId: recipe.getId(),
      variant,
      planContent: '',
      planPath,
      success: false,
      error: `Plan generation failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

async function executePlan(planResult: PlanResult): Promise<ExecutionResult> {
  if (!planResult.success) {
    return {
      projectPath: planResult.projectPath,
      recipeId: planResult.recipeId,
      success: false,
      error: planResult.error || 'Plan generation failed'
    };
  }

  const logPath = await workspaceConfig.getLogPath();
  
  try {
    const promptTemplate = loadPrompt('execute_plan');
    const executionPrompt = renderPrompt(promptTemplate, {
      plan_content: planResult.planContent
    });

    let executionLog = '';
    let errorMessage: string | undefined;
    let success = false;

    for await (const message of query({
      prompt: executionPrompt,
      options: {
        model: 'sonnet',
        maxTurns: 10,
        allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'MultiEdit', 'LS', 'Glob', 'Grep'],
        permissionMode: 'bypassPermissions',
      },
    })) {
      if (message.type === 'result') {
        if (message.subtype === 'success' && 'result' in message) {
          executionLog = message.result;
          success = true;
        } else {
          errorMessage = 'Plan execution failed';
          success = false;
          if ('error' in message) {
            errorMessage = `Plan execution failed: ${message.error}`;
          }
        }
        break;
      }
    }

    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, `Plan Execution Log - ${new Date().toISOString()}\n` +
      `Recipe: ${planResult.recipeId}\n` +
      `Project: ${planResult.projectPath}\n` +
      `Variant: ${planResult.variant}\n\n` +
      `--- PLAN ---\n${planResult.planContent}\n\n` +
      `--- EXECUTION LOG ---\n${executionLog}\n\n` +
      (errorMessage ? `--- ERROR ---\n${errorMessage}\n` : ''), 'utf8');

    if (!success || errorMessage) {
      return {
        projectPath: planResult.projectPath,
        recipeId: planResult.recipeId,
        success: false,
        error: errorMessage || 'Execution failed',
        logPath
      };
    }

    const outputs = extractPlanOutputs(planResult.planContent);

    return {
      projectPath: planResult.projectPath,
      recipeId: planResult.recipeId,
      success: true,
      outputs,
      logPath
    };

  } catch (error) {
    const errorMsg = `Execution failed: ${error instanceof Error ? error.message : String(error)}`;
    
    try {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.writeFileSync(logPath, `Plan Execution Error - ${new Date().toISOString()}\n` +
        `Recipe: ${planResult.recipeId}\n` +
        `Project: ${planResult.projectPath}\n` +
        `Error: ${errorMsg}\n`, 'utf8');
    } catch (logError) {
      console.error('Failed to write error log:', logError);
    }

    return {
      projectPath: planResult.projectPath,
      recipeId: planResult.recipeId,
      success: false,
      error: errorMsg,
      logPath
    };
  }
}

function extractPlanOutputs(planContent: string): Record<string, string | boolean> {
  try {
    const yamlMatch = planContent.match(/```yaml\n([\s\S]*?)\n```/);
    if (!yamlMatch) {
      return {};
    }
    
    const planYaml = yamlMatch[1];
    const plan = parseYaml(planYaml);
    
    if (plan && plan.outputs && typeof plan.outputs === 'object') {
      return plan.outputs;
    }
    
    return {};
  } catch (error) {
    console.error('Failed to parse plan outputs:', error);
    return {};
  }
}

async function updateState(recipeId: string, outputs: Record<string, string | boolean>): Promise<void> {
  const currentState = await readCurrentState();
  const timestamp = new Date().toISOString();
  const statePath = await workspaceConfig.getStatePath();

  for (const [key, value] of Object.entries(outputs)) {
    currentState[key] = {
      value,
      source: recipeId,
      timestamp
    };
  }

  await workspaceConfig.ensureChorenzoDir();
  await writeJson(statePath, currentState);
}