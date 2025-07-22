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
import { createApplyLogger, getApplyLogger, closeApplyLogger } from '../utils/logger.utils';
import { ApplyOptions, ApplyRecipeResult, ApplyError, RecipeState, StateEntry, DependencyValidationResult, ApplyRecipePlan, PlanResult, ExecutionResult, ApplyProgressCallback, ApplyValidationCallback } from '../types/apply';
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
    
    await createApplyLogger(recipe.getId(), options.project || 'workspace');
    
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
      
      if (planResult.costUsd) {
        totalCostUsd += planResult.costUsd;
      }
      
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
      totalProjects: planResults.length,
      successfulProjects: executionResults.filter(e => e.success).length,
      failedProjects: executionResults.filter(e => !e.success).length,
      skippedProjects: 0
    };

    const logger = getApplyLogger();
    logger.info({
      event: 'apply_completed',
      duration: durationSeconds,
      totalCost: totalCostUsd,
      summary
    }, 'Recipe application completed');
    
    closeApplyLogger();

    return {
      recipe,
      dependencyCheck,
      planResults,
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
      const logger = getApplyLogger();
      logger.error({
        event: 'apply_error',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, 'Recipe application failed');
      closeApplyLogger();
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
  const analysisPath = await workspaceConfig.getAnalysisPath();
  
  if (fs.existsSync(analysisPath)) {
    try {
      return await readJson(analysisPath);
    } catch (error) {
      // Analysis file exists but is corrupted or unreadable
      const logger = getApplyLogger();
      logger.warn({ 
        event: 'analysis_file_read_failed',
        error: error instanceof Error ? error.message : String(error) 
      }, `Failed to read analysis file`);
      logger.info({ event: 'regenerating_analysis' }, 'Regenerating analysis');
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
  
  const logger = getApplyLogger();
  logger.info({
    event: 'plan_generation_started',
    recipe: recipe.getId(),
    project: project.path,
    variant,
    planPath
  }, 'Starting plan generation');

  try {
    const ecosystem = recipe.getEcosystems().find(eco => eco.id === project.ecosystem);
    if (!ecosystem) {
      logger.warn({
        event: 'ecosystem_not_supported',
        ecosystem: project.ecosystem,
        recipe: recipe.getId()
      }, `Recipe does not support ecosystem: ${project.ecosystem}`);
      return {
        projectPath,
        recipeId: recipe.getId(),
        variant,
        planContent: '',
        planPath,
        success: false,
        error: `Recipe '${recipe.getId()}' does not support ecosystem '${project.ecosystem}'`,
        costUsd: 0
      };
    }

    logger.debug({ ecosystem: ecosystem.id }, 'Found matching ecosystem');
    const variantObj = ecosystem.variants.find(v => v.id === variant);
    if (!variantObj) {
      logger.warn({
        event: 'variant_not_found',
        variant,
        ecosystem: ecosystem.id
      }, `Variant not found: ${variant}`);
      return {
        projectPath,
        recipeId: recipe.getId(),
        variant,
        planContent: '',
        planPath,
        success: false,
        error: `Variant '${variant}' not found for ecosystem '${project.ecosystem}'`,
        costUsd: 0
      };
    }

    logger.debug({ variant }, 'Found matching variant');
    const promptTemplate = loadPrompt('generate_plan');
    const providesYaml = recipe.getProvides()
      .map(key => `    ${key}: true`)
      .join('\n');
    
    logger.debug({
      event: 'prompt_template_loaded',
      provides: recipe.getProvides()
    }, 'Loaded prompt template and built context');
    
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
      fix_content: variantObj.fix_prompt,
      plan_path: planPath
    });

    let planContent = '';
    let errorMessage: string | undefined;
    let planCost = 0;

    logger.info({ event: 'claude_query_started' }, 'Starting Claude query for plan generation');
    
    let messageCount = 0;
    let toolUsageCount = 0;
    const queryStartTime = Date.now();
    
    const progressInterval = setInterval(() => {
      const elapsed = ((Date.now() - queryStartTime) / 1000).toFixed(1);
      logger.info({
        event: 'plan_generation_progress',
        elapsed,
        messageCount,
        toolUsageCount
      }, `Plan generation progress: ${elapsed}s elapsed, ${messageCount} messages, ${toolUsageCount} tool calls`);
    }, 10000);
    
    try {
    for await (const message of query({
      prompt,
      options: {
        model: 'sonnet',
        allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'MultiEdit', 'LS', 'Glob', 'Grep'],
        permissionMode: 'bypassPermissions',
      },
    })) {
      messageCount++;
      
      if (message.type === 'system' && message.subtype === 'init') {
        logger.info({
          event: 'claude_system_init',
          sessionId: message.session_id,
          model: message.model,
          tools: message.tools,
          permissionMode: message.permissionMode,
          cwd: message.cwd
        }, 'Claude system initialized');
      }
      
      else if (message.type === 'assistant') {
        const content = message.message?.content;
        let toolUses = [];
        let textContent = '';
        
        if (Array.isArray(content)) {
          for (const block of content) {
            if (typeof block === 'object' && block !== null) {
              if ('type' in block && block.type === 'tool_use') {
                toolUses.push({
                  name: block.name,
                  id: block.id,
                  input: typeof block.input === 'object' ? JSON.stringify(block.input).substring(0, 300) : block.input
                });
              } else if ('type' in block && block.type === 'text') {
                textContent = block.text?.substring(0, 200) || '';
              }
            }
          }
        } else if (typeof content === 'string') {
          textContent = content.substring(0, 200);
        }
        
        logger.debug({
          event: 'claude_assistant_message',
          sessionId: message.session_id,
          textContent,
          toolUses,
          toolCount: toolUses.length
        }, `Claude assistant response${toolUses.length > 0 ? ` with ${toolUses.length} tool calls` : ''}`);
        
        for (const tool of toolUses) {
          toolUsageCount++;
          logger.info({
            event: 'claude_tool_use',
            sessionId: message.session_id,
            toolName: tool.name,
            toolId: tool.id,
            toolInput: tool.input
          }, `Claude calling tool: ${tool.name}`);
        }
      }
      
      else if (message.type === 'user') {
        const content = message.message?.content;
        let toolResults = [];
        let textContent = '';
        
        if (Array.isArray(content)) {
          for (const block of content) {
            if (typeof block === 'object' && block !== null) {
              if ('type' in block && block.type === 'tool_result') {
                toolResults.push({
                  tool_use_id: block.tool_use_id,
                  content: typeof block.content === 'string' ? block.content.substring(0, 300) : 'non-string content',
                  is_error: block.is_error || false
                });
              } else if ('type' in block && block.type === 'text') {
                textContent = block.text?.substring(0, 200) || '';
              }
            }
          }
        } else if (typeof content === 'string') {
          textContent = content.substring(0, 200);
        }
        
        logger.debug({
          event: 'claude_user_message', 
          sessionId: message.session_id,
          textContent,
          toolResults,
          toolCount: toolResults.length
        }, `Claude user message${toolResults.length > 0 ? ` with ${toolResults.length} tool results` : ''}`);
        
        for (const result of toolResults) {
          logger.info({
            event: 'claude_tool_result',
            sessionId: message.session_id,
            toolUseId: result.tool_use_id,
            isError: result.is_error,
            resultPreview: result.content
          }, `Tool result${result.is_error ? ' (ERROR)' : ''}: ${result.content.substring(0, 100)}`);
        }
      }
      
      else {
        logger.debug({ 
          event: 'claude_message',
          messageType: message.type,
          sessionId: 'session_id' in message ? message.session_id : undefined
        }, `Received Claude message: ${message.type}`);
      }
      
      if (message.type === 'result') {
        logger.info({
          event: 'claude_query_result',
          subtype: message.subtype,
          duration_ms: message.duration_ms,
          duration_api_ms: message.duration_api_ms,
          num_turns: message.num_turns,
          sessionId: message.session_id
        }, 'Claude query completed');
        
        if ('total_cost_usd' in message) {
          planCost = message.total_cost_usd;
          logger.info({ cost: planCost }, `Plan generation cost: $${planCost}`);
        }
        if (message.subtype === 'success') {
          logger.info({
            event: 'plan_generation_completed',
            cost: planCost
          }, 'Plan generation completed successfully');
        } else {
          errorMessage = 'Plan generation failed';
          logger.error({
            event: 'plan_generation_failed',
            subtype: message.subtype,
            error: 'error' in message ? message.error : undefined
          }, 'Plan generation failed');
        }
        break;
      }
    }
    } finally {
      clearInterval(progressInterval);
    }

    if (errorMessage) {
      logger.error({ error: errorMessage }, 'Plan generation failed');
      return {
        projectPath,
        recipeId: recipe.getId(),
        variant,
        planContent: '',
        planPath,
        success: false,
        error: errorMessage,
        costUsd: planCost
      };
    }

    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    
    if (!fs.existsSync(planPath)) {
      logger.error({ event: 'plan_file_not_found', planPath }, 'Plan file was not created by Claude');
      return {
        projectPath,
        recipeId: recipe.getId(),
        variant,
        planContent: '',
        planPath,
        success: false,
        error: 'Plan file was not created',
        costUsd: planCost
      };
    }

    planContent = fs.readFileSync(planPath, 'utf8');
    logger.info({ 
      event: 'plan_file_read',
      planPath,
      contentLength: planContent.length,
      content: planContent.substring(0, 100)
    }, 'Plan file read successfully');
    
    if (!planContent || planContent.trim() === '') {
      logger.error({ event: 'empty_plan' }, 'Plan file is empty');
      return {
        projectPath,
        recipeId: recipe.getId(),
        variant,
        planContent: '',
        planPath,
        success: false,
        error: 'Plan file is empty',
        costUsd: planCost
      };
    }

    const result = {
      projectPath,
      recipeId: recipe.getId(),
      variant,
      planContent,
      planPath,
      success: true,
      costUsd: planCost
    };
    logger.info({
      event: 'plan_generation_completed',
      cost: planCost
    }, 'Plan generation completed successfully');
    return result;

  } catch (error) {
    logger.error({
      event: 'plan_generation_error',
      error: error instanceof Error ? error.message : String(error)
    }, 'Plan generation caught error');
    return {
      projectPath,
      recipeId: recipe.getId(),
      variant,
      planContent: '',
      planPath,
      success: false,
      error: `Plan generation failed: ${error instanceof Error ? error.message : String(error)}`,
      costUsd: 0
    };
  }
}

async function executePlan(plan: ApplyRecipePlan): Promise<ExecutionResult> {
  const logger = getApplyLogger();
  logger.info({
    event: 'plan_execution_started',
    project: plan.projectPath,
    recipe: plan.recipeId
  }, 'Starting plan execution');
  
  if (!plan.success) {
    logger.warn({ event: 'plan_not_successful' }, 'Plan was not successful, skipping execution');
    return {
      projectPath: plan.projectPath,
      recipeId: plan.recipeId,
      success: false,
      error: plan.error || 'Plan generation failed',
      costUsd: plan.costUsd
    };
  }

  const logPath = await workspaceConfig.getLogPath();
  
  try {
    const promptTemplate = loadPrompt('execute_plan');
    const executionPrompt = renderPrompt(promptTemplate, {
      plan_content: plan.planContent
    });
    
    logger.debug({
      event: 'execution_prompt_prepared',
      promptLength: executionPrompt.length
    }, 'Execution prompt prepared');
    
    logger.info({
      event: 'plan_details',
      recipe: plan.recipeId,
      project: plan.projectPath,
      variant: plan.variant,
      planContentLength: plan.planContent.length
    }, 'Executing plan');

    let executionLog = '';
    let errorMessage: string | undefined;
    let success = false;
    let executionCost = 0;

    logger.info({ event: 'claude_execution_started' }, 'Starting Claude query for plan execution');
    const queryStartTime = Date.now();
    
    let messageCount = 0;
    let toolUsageCount = 0;
    
    const progressInterval = setInterval(() => {
      const elapsed = ((Date.now() - queryStartTime) / 1000).toFixed(1);
      logger.info({
        event: 'plan_execution_progress',
        elapsed,
        messageCount,
        toolUsageCount
      }, `Plan execution progress: ${elapsed}s elapsed, ${messageCount} messages, ${toolUsageCount} tool calls`);
    }, 10000);
    
    try {
    for await (const message of query({
      prompt: executionPrompt,
      options: {
        model: 'sonnet',
        allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'MultiEdit', 'LS', 'Glob', 'Grep'],
        permissionMode: 'bypassPermissions',
      },
    })) {
      messageCount++;
      const elapsed = ((Date.now() - queryStartTime) / 1000).toFixed(1);
      
      if (message.type === 'system' && message.subtype === 'init') {
        logger.info({
          event: 'claude_execution_system_init',
          sessionId: message.session_id,
          model: message.model,
          tools: message.tools,
          permissionMode: message.permissionMode,
          cwd: message.cwd,
          elapsed
        }, 'Claude execution system initialized');
      }
      
      else if (message.type === 'assistant') {
        const content = message.message?.content;
        let toolUses = [];
        let textContent = '';
        
        if (Array.isArray(content)) {
          for (const block of content) {
            if (typeof block === 'object' && block !== null) {
              if ('type' in block && block.type === 'tool_use') {
                toolUses.push({
                  name: block.name,
                  id: block.id,
                  input: typeof block.input === 'object' ? JSON.stringify(block.input).substring(0, 300) : block.input
                });
              } else if ('type' in block && block.type === 'text') {
                textContent = block.text?.substring(0, 200) || '';
              }
            }
          }
        } else if (typeof content === 'string') {
          textContent = content.substring(0, 200);
        }
        
        logger.debug({
          event: 'claude_execution_assistant_message',
          sessionId: message.session_id,
          textContent,
          toolUses,
          toolCount: toolUses.length,
          elapsed
        }, `Claude execution assistant response${toolUses.length > 0 ? ` with ${toolUses.length} tool calls` : ''}`);
        
        for (const tool of toolUses) {
          toolUsageCount++;
          logger.info({
            event: 'claude_execution_tool_use',
            sessionId: message.session_id,
            toolName: tool.name,
            toolId: tool.id,
            toolInput: tool.input,
            elapsed
          }, `Claude execution calling tool: ${tool.name}`);
        }
      }
      
      else if (message.type === 'user') {
        const content = message.message?.content;
        let toolResults = [];
        let textContent = '';
        
        if (Array.isArray(content)) {
          for (const block of content) {
            if (typeof block === 'object' && block !== null) {
              if ('type' in block && block.type === 'tool_result') {
                toolResults.push({
                  tool_use_id: block.tool_use_id,
                  content: typeof block.content === 'string' ? block.content.substring(0, 300) : 'non-string content',
                  is_error: block.is_error || false
                });
              } else if ('type' in block && block.type === 'text') {
                textContent = block.text?.substring(0, 200) || '';
              }
            }
          }
        } else if (typeof content === 'string') {
          textContent = content.substring(0, 200);
        }
        
        logger.debug({
          event: 'claude_execution_user_message', 
          sessionId: message.session_id,
          textContent,
          toolResults,
          toolCount: toolResults.length,
          elapsed
        }, `Claude execution user message${toolResults.length > 0 ? ` with ${toolResults.length} tool results` : ''}`);
        
        for (const result of toolResults) {
          logger.info({
            event: 'claude_execution_tool_result',
            sessionId: message.session_id,
            toolUseId: result.tool_use_id,
            isError: result.is_error,
            resultPreview: result.content,
            elapsed
          }, `Execution tool result${result.is_error ? ' (ERROR)' : ''}: ${result.content.substring(0, 100)}`);
        }
      }
      
      else {
        logger.debug({ 
          event: 'claude_execution_message',
          messageType: message.type,
          sessionId: 'session_id' in message ? message.session_id : undefined,
          elapsed
        }, `Received Claude execution message: ${message.type}`);
      }
      
      if (message.type === 'result') {
        logger.info({
          event: 'claude_execution_result',
          subtype: message.subtype,
          duration_ms: message.duration_ms,
          duration_api_ms: message.duration_api_ms,
          num_turns: message.num_turns,
          sessionId: message.session_id,
          elapsed
        }, 'Claude execution completed');
        
        if ('total_cost_usd' in message) {
          executionCost = message.total_cost_usd;
          logger.info({ cost: executionCost, elapsed }, `Execution cost: $${executionCost}`);
        }
        if (message.subtype === 'success' && 'result' in message) {
          executionLog = message.result;
          success = true;
          logger.info({ 
            event: 'execution_success',
            resultLength: executionLog.length,
            elapsed 
          }, `Execution completed successfully (${executionLog.length} chars)`);
        } else {
          errorMessage = 'Plan execution failed';
          success = false;
          if ('error' in message) {
            errorMessage = `Plan execution failed: ${message.error}`;
          }
          logger.error({
            event: 'execution_failed',
            subtype: message.subtype,
            error: 'error' in message ? message.error : undefined,
            elapsed
          }, `Execution failed: ${message.subtype}`);
        }
        break;
      }
    }
    } finally {
      clearInterval(progressInterval);
    }
    
    const totalElapsed = ((Date.now() - queryStartTime) / 1000).toFixed(1);
    logger.info({ event: 'claude_execution_completed', elapsed: totalElapsed }, `Claude execution query completed in ${totalElapsed}s`);

    fs.appendFileSync(logPath, `\n--- EXECUTION COMPLETED - ${new Date().toISOString()} ---\n` +
      `Success: ${success}\n` +
      `Cost: $${executionCost}\n` +
      `--- EXECUTION LOG ---\n${executionLog}\n\n` +
      (errorMessage ? `--- ERROR ---\n${errorMessage}\n` : ''), 'utf8');
    logger.info({ event: 'execution_log_updated' }, 'Final log updated');

    if (!success || errorMessage) {
      logger.error({ event: 'execution_failed', error: errorMessage }, 'Execution failed, returning error result');
      return {
        projectPath: plan.projectPath,
        recipeId: plan.recipeId,
        success: false,
        error: errorMessage || 'Execution failed',
        logPath,
        costUsd: executionCost
      };
    }

    logger.info({ event: 'extracting_plan_outputs' }, 'Extracting plan outputs');
    const outputs = extractPlanOutputs(plan.planContent);
    logger.info({ 
      event: 'plan_outputs_extracted', 
      outputCount: Object.keys(outputs).length,
      outputs 
    }, `Extracted ${Object.keys(outputs).length} outputs from plan`);

    const result = {
      projectPath: plan.projectPath,
      recipeId: plan.recipeId,
      success: true,
      outputs,
      logPath,
      costUsd: executionCost
    };
    logger.info({ 
      event: 'execution_completed_successfully',
      outputCount: Object.keys(outputs).length 
    }, 'Plan execution completed successfully');
    return result;

  } catch (error) {
    const errorMsg = `Execution failed: ${error instanceof Error ? error.message : String(error)}`;
    logger.error({ 
      event: 'execution_error',
      error: error instanceof Error ? error.message : String(error) 
    }, 'Plan execution caught error');
    
    try {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.writeFileSync(logPath, `Plan Execution Error - ${new Date().toISOString()}\n` +
        `Recipe: ${plan.recipeId}\n` +
        `Project: ${plan.projectPath}\n` +
        `Error: ${errorMsg}\n`, 'utf8');
      logger.info({ event: 'error_log_written', logPath }, 'Error log written');
    } catch (logError) {
      logger.error({ 
        event: 'error_log_write_failed',
        error: logError instanceof Error ? logError.message : String(logError) 
      }, 'Failed to write error log');
    }

    return {
      projectPath: plan.projectPath,
      recipeId: plan.recipeId,
      success: false,
      error: errorMsg,
      logPath,
      costUsd: 0
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
    
    if (plan?.outputs && typeof plan.outputs === 'object') {
      return plan.outputs;
    }
    
    return {};
  } catch (error) {
    const logger = getApplyLogger();
    logger.error({ 
      event: 'plan_output_parse_failed',
      error: error instanceof Error ? error.message : String(error) 
    }, 'Failed to parse plan outputs');
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