import { query } from '@anthropic-ai/claude-code';
import * as fs from 'fs';
import * as path from 'path';

import { ProjectAnalysis, WorkspaceAnalysis } from '~/types/analysis';
import { Recipe, RecipeDependency } from '~/types/recipe';
import {
  ReApplicationCheckResult,
  ReApplicationTarget,
  RecipesApplyDependencyValidationResult,
  RecipesApplyError,
  RecipesApplyExecutionResult,
  RecipesApplyOptions,
  RecipesApplyProgressCallback,
  RecipesApplyResult,
  RecipesApplyState,
} from '~/types/recipes-apply';
import { WorkspaceState } from '~/types/state';
import {
  CodeChangesEventHandlers,
  executeCodeChangesOperation,
} from '~/utils/code-changes-events.utils';
import { chorenzoConfig } from '~/utils/config.utils';
import { GitignoreManager } from '~/utils/gitignore.utils';
import { readJson } from '~/utils/json.utils';
import { libraryManager } from '~/utils/library-manager.utils';
import { Logger } from '~/utils/logger.utils';
import { resolvePath } from '~/utils/path.utils';
import {
  findProjectByPath,
  getProjectCharacteristic,
  getWorkspaceCharacteristic,
  isProjectKeyword,
  isReservedKeyword,
  isWorkspaceKeyword,
  loadWorkspaceAnalysis,
} from '~/utils/project-characteristics.utils';
import {
  loadDoc,
  loadPrompt,
  loadTemplate,
  renderPrompt,
} from '~/utils/prompts.utils';
import {
  parseRecipeFromDirectory,
  parseRecipeLibraryFromDirectory,
} from '~/utils/recipe.utils';
import { stateManager } from '~/utils/state-manager.utils';
import { workspaceConfig } from '~/utils/workspace-config.utils';

import { extractErrorMessage, formatErrorMessage } from '../utils/error.utils';
import { performAnalysis } from './analyze';

export type ProgressCallback = (
  step: string | null,
  isThinking?: boolean
) => void;

export interface RecipesGenerateOptions {
  name?: string;
  cost?: boolean;
  magicGenerate?: boolean;
  category?: string;
  summary?: string;
  location?: string;
  saveLocation?: string;
  additionalInstructions?: string;
  ecosystemAgnostic?: boolean;
}

export interface RecipesGenerateResult {
  recipePath: string;
  recipeName: string;
  success: boolean;
  error?: string;
  metadata?: {
    costUsd: number;
    durationSeconds: number;
  };
}

export class RecipesError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'RecipesError';
  }
}

export enum InputType {
  RecipeName = 'recipe-name',
  RecipeFolder = 'recipe-folder',
  Library = 'library',
  GitUrl = 'git-url',
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

export async function loadRecipe(recipeName: string): Promise<Recipe> {
  const inputType = detectInputType(recipeName);
  const resolvedTarget =
    inputType === InputType.RecipeName || inputType === InputType.GitUrl
      ? recipeName
      : resolvePath(recipeName);

  switch (inputType) {
    case InputType.RecipeName: {
      let foundPaths = await libraryManager.findRecipeByName(resolvedTarget);

      if (foundPaths.length === 0) {
        Logger.info(
          { recipe: recipeName },
          'Recipe not found locally, refreshing all libraries'
        );
        await libraryManager.refreshAllLibraries();

        foundPaths = await libraryManager.findRecipeByName(resolvedTarget);
        if (foundPaths.length === 0) {
          throw new RecipesApplyError(
            `Recipe '${recipeName}' not found in recipe libraries even after refreshing`,
            'RECIPE_NOT_FOUND'
          );
        }
      }

      if (foundPaths.length > 1) {
        const pathsList = foundPaths.map((p) => `  - ${p}`).join('\n');
        throw new RecipesApplyError(
          `Multiple recipes named '${recipeName}' found:\n${pathsList}\nPlease specify the full path.`,
          'MULTIPLE_RECIPES_FOUND'
        );
      }

      const recipePath = foundPaths[0];
      if (!recipePath) {
        throw new RecipesApplyError(
          `Recipe path not found for '${recipeName}'`,
          'RECIPE_PATH_NOT_FOUND'
        );
      }
      const libraryName = libraryManager.isRemoteLibrary(recipePath);
      if (libraryName) {
        Logger.info(
          { recipe: recipeName, library: libraryName },
          'Recipe is from remote library, refreshing'
        );
        await libraryManager.refreshLibrary(libraryName);
      }

      return await parseRecipeFromDirectory(recipePath);
    }

    case InputType.RecipeFolder: {
      if (!fs.existsSync(resolvedTarget)) {
        throw new RecipesApplyError(
          `Recipe folder does not exist: ${resolvedTarget}`,
          'RECIPE_NOT_FOUND'
        );
      }

      const libraryName = libraryManager.isRemoteLibrary(resolvedTarget);
      if (libraryName) {
        Logger.info(
          { recipe: recipeName, library: libraryName },
          'Recipe is from remote library, refreshing'
        );
        await libraryManager.refreshLibrary(libraryName);
      }

      return await parseRecipeFromDirectory(resolvedTarget);
    }

    default:
      throw new RecipesApplyError(
        `Invalid recipe target: ${recipeName}`,
        'INVALID_RECIPE_TARGET'
      );
  }
}

export async function checkRecipeReApplication(
  options: RecipesApplyOptions,
  onProgress?: RecipesApplyProgressCallback
): Promise<{ recipeId: string; reApplicationCheck: ReApplicationCheckResult }> {
  onProgress?.('Loading recipe');
  const recipe = await loadRecipe(options.recipe);

  onProgress?.('Validating recipe structure');
  const validationResult = recipe.validate();
  if (!validationResult.valid) {
    const errors = validationResult.errors.map((e) => e.message).join(', ');
    throw new RecipesApplyError(
      `Recipe validation failed: ${errors}`,
      'RECIPE_INVALID'
    );
  }

  onProgress?.('Ensuring analysis data');
  const analysis = await ensureAnalysisData();

  onProgress?.('Checking recipe dependencies');
  const currentState = await readCurrentState();
  const dependencyCheck = await validateWorkspaceDependencies(
    recipe,
    currentState
  );

  if (!dependencyCheck.satisfied) {
    const errorMsg = formatDependencyError(
      recipe.getId(),
      dependencyCheck,
      currentState
    );
    throw new RecipesApplyError(errorMsg, 'DEPENDENCIES_NOT_SATISFIED');
  }

  onProgress?.('Checking for previous recipe applications');
  const reApplicationCheck = await checkReApplication(
    recipe,
    analysis,
    options
  );

  return {
    recipeId: recipe.getId(),
    reApplicationCheck,
  };
}

export async function performRecipesApply(
  options: RecipesApplyOptions,
  onProgress?: RecipesApplyProgressCallback
): Promise<RecipesApplyResult> {
  const startTime = new Date();
  const startTimeIso = startTime.toISOString();
  let totalCostUsd = 0;

  try {
    onProgress?.('Loading recipe');
    const recipe = await loadRecipe(options.recipe);

    onProgress?.('Validating recipe structure');
    const validationResult = recipe.validate();
    if (!validationResult.valid) {
      const errors = validationResult.errors.map((e) => e.message).join(', ');
      throw new RecipesApplyError(
        `Recipe validation failed: ${errors}`,
        'RECIPE_INVALID'
      );
    }

    onProgress?.('Ensuring analysis data');
    const analysis = await ensureAnalysisData();

    onProgress?.('Checking recipe dependencies');
    const currentState = await readCurrentState();
    const dependencyCheck = await validateWorkspaceDependencies(
      recipe,
      currentState
    );

    if (!dependencyCheck.satisfied) {
      const errorMsg = formatDependencyError(
        recipe.getId(),
        dependencyCheck,
        currentState
      );
      throw new RecipesApplyError(errorMsg, 'DEPENDENCIES_NOT_SATISFIED');
    }

    onProgress?.('Checking for previous recipe applications');
    const reApplicationCheck = await checkReApplication(
      recipe,
      analysis,
      options
    );

    if (
      reApplicationCheck.hasAlreadyApplied &&
      !reApplicationCheck.userConfirmedProceed
    ) {
      throw new RecipesApplyError(
        'Recipe application cancelled by user due to previous application',
        'USER_CANCELLED_REAPPLICATION'
      );
    }

    onProgress?.('Initializing the chorenzo engine');
    const executionResults: RecipesApplyExecutionResult[] = [];

    onProgress?.('Setting up git ignore patterns');
    const workspaceRoot = workspaceConfig.getWorkspaceRoot();
    GitignoreManager.ensureChorenzoIgnorePatterns(workspaceRoot);

    if (recipe.isWorkspaceOnly()) {
      const workspaceEcosystem = analysis.workspaceEcosystem || 'unknown';
      if (!recipe.hasEcosystem(workspaceEcosystem)) {
        throw new RecipesApplyError(
          `Workspace-only recipe '${recipe.getId()}' does not support workspace ecosystem '${workspaceEcosystem}'`,
          'ECOSYSTEM_NOT_SUPPORTED'
        );
      }

      const variant =
        options.variant ||
        recipe.getDefaultVariant(workspaceEcosystem) ||
        'default';

      const executionResult = await applyWorkspaceRecipe(
        recipe,
        variant,
        analysis,
        onProgress
      );

      totalCostUsd += executionResult.costUsd;
      executionResults.push(executionResult);

      if (executionResult.success) {
        onProgress?.('Successfully applied workspace recipe');
      } else {
        onProgress?.(
          `Failed to apply workspace recipe: ${executionResult.error}`
        );
      }
    } else if (recipe.isWorkspacePreferred()) {
      const { workspaceResult, projectResults } =
        await applyWorkspacePreferredRecipe(
          recipe,
          analysis,
          options,
          onProgress
        );

      if (workspaceResult) {
        totalCostUsd += workspaceResult.costUsd;
        executionResults.push(workspaceResult);
      }

      for (const projectResult of projectResults) {
        totalCostUsd += projectResult.costUsd;
        executionResults.push(projectResult);
      }

      if (executionResults.length === 0) {
        throw new RecipesApplyError(
          `Recipe '${recipe.getId()}' could not be applied at workspace or project level`,
          'NO_APPLICABLE_SCOPE'
        );
      }
    } else {
      onProgress?.('Filtering applicable projects');
      const applicableProjects = await filterApplicableProjects(
        analysis,
        recipe,
        options.project
      );

      if (applicableProjects.length === 0) {
        throw new RecipesApplyError(
          `No applicable projects found for recipe '${recipe.getId()}'`,
          'NO_APPLICABLE_PROJECTS'
        );
      }

      for (const project of applicableProjects) {
        const variant =
          options.variant ||
          recipe.getDefaultVariant(project.ecosystem || 'unknown') ||
          'default';
        const executionResult = await applyProjectRecipe(
          recipe,
          project,
          variant,
          analysis,
          onProgress
        );

        totalCostUsd += executionResult.costUsd;
        executionResults.push(executionResult);

        if (executionResult.success) {
          onProgress?.(
            `Successfully applied to ${executionResult.projectPath}`
          );
        } else {
          onProgress?.(
            `Failed to apply to ${executionResult.projectPath}: ${executionResult.error}`
          );
        }
      }
    }

    const endTime = new Date();
    const endTimeIso = endTime.toISOString();
    const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;

    const summary = {
      totalProjects: executionResults.length,
      successfulProjects: executionResults.filter((e) => e.success).length,
      failedProjects: executionResults.filter((e) => !e.success).length,
      skippedProjects: 0,
    };

    Logger.info(
      {
        event: 'apply_completed',
        duration: durationSeconds,
        totalCost: totalCostUsd,
        summary,
      },
      'Recipe application completed'
    );

    return {
      recipe,
      dependencyCheck,
      executionResults,
      summary,
      metadata: {
        durationSeconds,
        costUsd: totalCostUsd,
        turns: executionResults.length,
        startTime: startTimeIso,
        endTime: endTimeIso,
        type: 'result',
        subtype: 'success',
      },
    };
  } catch (error) {
    Logger.error(
      {
        event: 'apply_error',
        error: extractErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Recipe application failed'
    );

    if (error instanceof RecipesApplyError) {
      throw error;
    }
    throw new RecipesApplyError(
      formatErrorMessage('Apply operation failed', error),
      'APPLY_FAILED'
    );
  }
}

async function ensureAnalysisData(): Promise<WorkspaceAnalysis> {
  const analysisPath = workspaceConfig.getAnalysisPath();

  if (fs.existsSync(analysisPath)) {
    try {
      return await readJson(analysisPath);
    } catch (error) {
      Logger.warn(
        {
          event: 'analysis_file_read_failed',
          error: extractErrorMessage(error),
        },
        `Failed to read analysis file`
      );
      Logger.info({ event: 'regenerating_analysis' }, 'Regenerating analysis');
    }
  }

  const analysisResult = await performAnalysis();
  if (!analysisResult.analysis) {
    throw new RecipesApplyError(
      `Analysis failed: ${analysisResult.metadata?.error || 'Unknown error'}`,
      'ANALYSIS_FAILED'
    );
  }

  return analysisResult.analysis;
}

async function readCurrentState(): Promise<RecipesApplyState> {
  try {
    const workspaceState = stateManager.getWorkspaceState();
    return (workspaceState.workspace || {}) as RecipesApplyState;
  } catch (error) {
    throw new RecipesApplyError(
      formatErrorMessage('Failed to read state file', error),
      'STATE_READ_FAILED'
    );
  }
}

async function validateWorkspaceDependencies(
  recipe: Recipe,
  currentState: RecipesApplyState
): Promise<RecipesApplyDependencyValidationResult> {
  const missing: RecipeDependency[] = [];
  const conflicting: Array<{ key: string; required: string; current: string }> =
    [];

  let analysis: WorkspaceAnalysis | null = null;

  for (const dependency of recipe.getRequires()) {
    let currentValue: string | undefined;

    if (isReservedKeyword(dependency.key)) {
      if (isProjectKeyword(dependency.key)) {
        continue;
      }

      if (!analysis) {
        analysis = await loadWorkspaceAnalysis();
        if (!analysis) {
          missing.push(dependency);
          continue;
        }
      }

      if (isWorkspaceKeyword(dependency.key)) {
        currentValue = getWorkspaceCharacteristic(analysis, dependency.key);
      }
    } else {
      const stateValue = currentState[dependency.key];
      currentValue = stateValue ? String(stateValue) : undefined;
    }

    if (currentValue === undefined) {
      missing.push(dependency);
    } else if (currentValue !== String(dependency.equals)) {
      conflicting.push({
        key: dependency.key,
        required: String(dependency.equals),
        current: currentValue,
      });
    }
  }

  return {
    satisfied: missing.length === 0 && conflicting.length === 0,
    missing,
    conflicting,
  };
}

async function validateDependencies(
  recipe: Recipe,
  currentState: RecipesApplyState,
  projectPath?: string
): Promise<RecipesApplyDependencyValidationResult> {
  const missing: RecipeDependency[] = [];
  const conflicting: Array<{ key: string; required: string; current: string }> =
    [];

  let analysis: WorkspaceAnalysis | null = null;
  let project: ProjectAnalysis | undefined;

  for (const dependency of recipe.getRequires()) {
    let currentValue: string | undefined;

    if (isReservedKeyword(dependency.key)) {
      if (!analysis) {
        analysis = await loadWorkspaceAnalysis();
        if (!analysis) {
          missing.push(dependency);
          continue;
        }
      }

      if (isWorkspaceKeyword(dependency.key)) {
        currentValue = getWorkspaceCharacteristic(analysis, dependency.key);
      } else if (isProjectKeyword(dependency.key)) {
        if (!projectPath) {
          missing.push(dependency);
          continue;
        }

        if (!project) {
          project = findProjectByPath(analysis, projectPath);
          if (!project) {
            missing.push(dependency);
            continue;
          }
        }

        currentValue = getProjectCharacteristic(project, dependency.key);
      }
    } else {
      const stateValue = currentState[dependency.key];
      currentValue = stateValue ? String(stateValue) : undefined;
    }

    if (currentValue === undefined) {
      missing.push(dependency);
    } else if (currentValue !== String(dependency.equals)) {
      conflicting.push({
        key: dependency.key,
        required: String(dependency.equals),
        current: currentValue,
      });
    }
  }

  return {
    satisfied: missing.length === 0 && conflicting.length === 0,
    missing,
    conflicting,
  };
}

function formatDependencyError(
  recipeId: string,
  validationResult: RecipesApplyDependencyValidationResult,
  currentState: RecipesApplyState
): string {
  const lines = [`Recipe '${recipeId}' has unsatisfied dependencies:`];

  for (const dep of validationResult.missing) {
    const currentValue = currentState[dep.key] ?? 'undefined';
    lines.push(`  - ${dep.key} = ${dep.equals} (currently: ${currentValue})`);
  }

  for (const conflict of validationResult.conflicting) {
    lines.push(
      `  - ${conflict.key} = ${conflict.required} (currently: ${conflict.current})`
    );
  }

  lines.push('');
  lines.push('Consider running prerequisite recipes first.');

  return lines.join('\n');
}

async function checkReApplication(
  recipe: Recipe,
  analysis: WorkspaceAnalysis,
  options: RecipesApplyOptions
): Promise<ReApplicationCheckResult> {
  const targets: ReApplicationTarget[] = [];
  const recipeId = recipe.getId();

  if (recipe.isWorkspaceOnly()) {
    if (stateManager.isRecipeApplied(recipeId, 'workspace')) {
      targets.push({ level: 'workspace' });
    }
  } else if (recipe.isWorkspacePreferred()) {
    const workspaceEcosystem = analysis.workspaceEcosystem || 'unknown';
    const workspaceState = stateManager.getWorkspaceState();
    const workspaceRecipesApplyState = (workspaceState.workspace ||
      {}) as RecipesApplyState;

    const canApplyAtWorkspace = await canApplyRecipeAtWorkspace(
      recipe,
      analysis,
      workspaceRecipesApplyState
    );

    if (
      canApplyAtWorkspace &&
      stateManager.isRecipeApplied(recipeId, 'workspace')
    ) {
      targets.push({ level: 'workspace' });
    }

    const applicableProjects = await getApplicableProjectsForWorkspacePreferred(
      recipe,
      analysis,
      workspaceEcosystem,
      workspaceState,
      options.project
    );

    for (const project of applicableProjects) {
      if (stateManager.isRecipeApplied(recipeId, 'project', project.path)) {
        targets.push({ level: 'project', path: project.path });
      }
    }
  } else {
    const applicableProjects = await filterApplicableProjects(
      analysis,
      recipe,
      options.project
    );

    for (const project of applicableProjects) {
      if (stateManager.isRecipeApplied(recipeId, 'project', project.path)) {
        targets.push({ level: 'project', path: project.path });
      }
    }
  }

  const hasAlreadyApplied = targets.length > 0;

  return {
    hasAlreadyApplied,
    targets,
    userConfirmedProceed: !hasAlreadyApplied || Boolean(options.yes),
  };
}

async function filterApplicableProjects(
  analysis: WorkspaceAnalysis,
  recipe: Recipe,
  projectFilter?: string
): Promise<ProjectAnalysis[]> {
  let projects = analysis.projects;

  if (projectFilter) {
    projects = projects.filter(
      (p) => p.path === projectFilter || p.path.includes(projectFilter)
    );
  }

  const applicableProjects: ProjectAnalysis[] = [];
  const workspaceState = stateManager.getWorkspaceState();

  for (const project of projects) {
    if (!project.ecosystem) {
      continue;
    }
    if (!recipe.hasEcosystem(project.ecosystem)) {
      continue;
    }

    const relativePath = path.relative(
      workspaceConfig.getWorkspaceRoot(),
      project.path
    );
    const projectState = (workspaceState.projects?.[relativePath] ||
      {}) as RecipesApplyState;

    const dependencyCheck = await validateDependencies(
      recipe,
      projectState,
      project.path
    );

    if (dependencyCheck.satisfied) {
      applicableProjects.push(project);
    }
  }

  return applicableProjects;
}

function generateApplicationInstructions(
  recipe: Recipe,
  project?: ProjectAnalysis
): string {
  if (recipe.isWorkspaceLevel() && !project) {
    return loadPrompt('apply_recipe_workspace_application_instructions');
  } else {
    if (!project) {
      throw new Error('Project information required for project-level recipe');
    }

    const workspaceRoot = workspaceConfig.getWorkspaceRoot();
    const relativePath = path.relative(workspaceRoot, project.path);

    const template = loadPrompt(
      'apply_recipe_project_application_instructions'
    );
    return renderPrompt(template, {
      project_path: relativePath,
      project_ecosystem: project.ecosystem || 'unknown',
      project_language: project.language || 'unknown',
      project_type: project.type || 'unknown',
    });
  }
}

function generateStateManagementInstructions(
  recipe: Recipe,
  project?: ProjectAnalysis
): string {
  const workspaceRoot = workspaceConfig.getWorkspaceRoot();
  const provides = recipe
    .getProvides()
    .map((key) => `   - ${key}`)
    .join('\n');

  if (recipe.isWorkspaceLevel() && !project) {
    const template = loadPrompt('apply_recipe_workspace_state_management');
    return renderPrompt(template, {
      workspace_root: workspaceRoot,
      recipe_provides: provides,
      recipe_id: recipe.getId(),
    });
  } else {
    if (!project) {
      throw new Error('Project information required for project-level recipe');
    }

    const relativePath = path.relative(workspaceRoot, project.path);
    const template = loadPrompt('apply_recipe_project_state_management');
    return renderPrompt(template, {
      workspace_root: workspaceRoot,
      recipe_provides: provides,
      recipe_id: recipe.getId(),
      project_relative_path: relativePath,
    });
  }
}

async function applyWorkspaceRecipe(
  recipe: Recipe,
  variant: string,
  analysis: WorkspaceAnalysis,
  onProgress?: RecipesApplyProgressCallback
): Promise<RecipesApplyExecutionResult> {
  const targetEcosystem = analysis.workspaceEcosystem || 'unknown';

  Logger.info(
    {
      event: 'workspace_recipe_application_started',
      recipe: recipe.getId(),
      variant,
    },
    'Starting workspace recipe application'
  );

  return executeRecipe(
    recipe,
    variant,
    targetEcosystem,
    'workspace',
    analysis,
    onProgress,
    'workspace_recipe_application',
    undefined
  );
}

async function applyProjectRecipe(
  recipe: Recipe,
  project: ProjectAnalysis,
  variant: string,
  analysis: WorkspaceAnalysis,
  onProgress?: RecipesApplyProgressCallback
): Promise<RecipesApplyExecutionResult> {
  const projectPath = project.path === '.' ? 'workspace' : project.path;
  const targetEcosystem = project.ecosystem || 'unknown';

  Logger.info(
    {
      event: 'project_recipe_application_started',
      recipe: recipe.getId(),
      project: project.path,
      variant,
    },
    'Starting project recipe application'
  );

  return executeRecipe(
    recipe,
    variant,
    targetEcosystem,
    projectPath,
    analysis,
    onProgress,
    'project_recipe_application',
    project
  );
}

async function executeRecipe(
  recipe: Recipe,
  variant: string,
  targetEcosystem: string,
  projectPath: string,
  analysis: WorkspaceAnalysis,
  onProgress?: RecipesApplyProgressCallback,
  logEventPrefix?: string,
  project?: ProjectAnalysis
): Promise<RecipesApplyExecutionResult> {
  const workspaceRoot = workspaceConfig.getWorkspaceRoot();

  try {
    const baseFixContent = recipe.getBaseFixContent();
    if (!baseFixContent) {
      Logger.warn(
        {
          event: 'base_fix_missing',
          recipe: recipe.getId(),
        },
        `Recipe missing required fix.md file`
      );
      return {
        projectPath,
        recipeId: recipe.getId(),
        success: false,
        error: `Recipe '${recipe.getId()}' is missing required fix.md file`,
        costUsd: 0,
      };
    }

    let fixContent: string;

    if (recipe.isEcosystemAgnostic()) {
      fixContent = baseFixContent;
    } else {
      const ecosystem = recipe
        .getEcosystems()
        .find((eco) => eco.id === targetEcosystem);
      if (!ecosystem) {
        Logger.warn(
          {
            event: 'ecosystem_not_supported',
            ecosystem: targetEcosystem,
            recipe: recipe.getId(),
          },
          `Recipe does not support ecosystem: ${targetEcosystem}`
        );
        return {
          projectPath,
          recipeId: recipe.getId(),
          success: false,
          error: `Recipe '${recipe.getId()}' does not support ecosystem '${targetEcosystem}'`,
          costUsd: 0,
        };
      }

      const variants = recipe.getVariantsForEcosystem(targetEcosystem);
      const variantObj = variants.find((v) => v.id === variant);

      if (!variantObj) {
        Logger.warn(
          {
            event: 'variant_not_found',
            ecosystem: targetEcosystem,
            variant,
            recipe: recipe.getId(),
          },
          `Variant '${variant}' not found for ecosystem ${targetEcosystem}`
        );
        return {
          projectPath,
          recipeId: recipe.getId(),
          success: false,
          error: `Variant '${variant}' not found for ecosystem '${targetEcosystem}'`,
          costUsd: 0,
        };
      }

      fixContent = recipe.getFixContentForVariant(targetEcosystem, variant);
    }
    const recipePrompt = recipe.getPrompt();

    const promptTemplate = loadPrompt('apply_recipe');
    const combinedContent = recipePrompt.content + '\n\n' + fixContent;

    const applicationInstructions = generateApplicationInstructions(
      recipe,
      project
    );
    const stateManagementInstructions = generateStateManagementInstructions(
      recipe,
      project
    );

    const applicationPrompt = renderPrompt(promptTemplate, {
      recipe_id: recipe.getId(),
      recipe_summary: recipe.getSummary(),
      workspace_root: workspaceRoot,
      is_monorepo: analysis.isMonorepo ? 'true' : 'false',
      recipe_variant: variant,
      fix_content: combinedContent,
      application_instructions: applicationInstructions,
      state_management_instructions: stateManagementInstructions,
    });

    Logger.debug(
      {
        event: 'claude_execution_start',
        prompt_length: applicationPrompt.length,
      },
      'Starting Claude execution for recipe application'
    );

    let executionCost = 0;
    let success = false;
    let recipeOutput: string | undefined;
    const operationStartTime = new Date();

    const handlers: CodeChangesEventHandlers = {
      onProgress: (step) => {
        onProgress?.(step, false);
      },
      onThinkingStateChange: (isThinking) => {
        onProgress?.(null, isThinking);
      },
      onComplete: (result, metadata) => {
        executionCost = metadata?.costUsd || 0;
        success = true;
        if (result && typeof result === 'string' && result.trim().length > 0) {
          recipeOutput = result;
        }
        Logger.info(
          {
            event: 'claude_execution_completed',
          },
          'Claude execution query completed'
        );
      },
      onError: (error) => {
        Logger.error(
          {
            event: `${logEventPrefix}_failed`,
            error: error.message,
          },
          'Recipe application failed'
        );
      },
    };

    const operationResult = await executeCodeChangesOperation(
      query({
        prompt: applicationPrompt,
        options: {
          model: 'sonnet',
          allowedTools: [
            'Bash',
            'Read',
            'Write',
            'Edit',
            'MultiEdit',
            'LS',
            'Glob',
            'Grep',
          ],
          disallowedTools: [
            'Bash(git commit:*)',
            'Bash(git push:*)',
            'Bash(git merge:*)',
            'Bash(git rebase:*)',
            'Bash(git reset:*)',
            'Bash(git branch -D:*)',
            'Bash(git branch -d:*)',
            'Bash(git tag -d:*)',
            'Bash(git clean -f:*)',
            'Bash(git rm:*)',
            'Bash(git mv:*)',
            'Bash(git stash drop:*)',
            'Bash(git stash clear:*)',
            'Bash(git remote add:*)',
            'Bash(git remote remove:*)',
            'Bash(git remote rm:*)',
            'Bash(sudo:*)',
            'Bash(rm:*)',
            'Bash(chmod:*)',
            'Bash(chown:*)',
          ],
          permissionMode: 'bypassPermissions',
        },
      }),
      handlers,
      operationStartTime
    );

    executionCost = operationResult.metadata.costUsd;

    if (operationResult.success) {
      success = true;
      if (
        !recipeOutput &&
        operationResult.result &&
        typeof operationResult.result === 'string' &&
        operationResult.result.trim().length > 0
      ) {
        recipeOutput = operationResult.result;
      }
    } else {
      success = false;
    }

    if (!success) {
      const result: RecipesApplyExecutionResult = {
        projectPath,
        recipeId: recipe.getId(),
        success: false,
        error:
          operationResult.error || 'Recipe application failed during execution',
        costUsd: executionCost,
      };
      if (recipeOutput) {
        result.output = recipeOutput;
      }
      return result;
    }

    Logger.info(
      {
        event: `${logEventPrefix}_completed`,
      },
      'Recipe application completed successfully'
    );

    const level = projectPath === 'workspace' ? 'workspace' : 'project';
    const actualProjectPath =
      projectPath === 'workspace' ? undefined : projectPath;

    stateManager.recordAppliedRecipe(recipe.getId(), level, actualProjectPath);

    const result: RecipesApplyExecutionResult = {
      projectPath,
      recipeId: recipe.getId(),
      success: true,
      costUsd: executionCost,
    };
    if (recipeOutput) {
      result.output = recipeOutput;
    }
    return result;
  } catch (error) {
    Logger.error(
      {
        event: `${logEventPrefix}_error`,
        error: extractErrorMessage(error),
      },
      'Error during recipe application'
    );

    return {
      projectPath,
      recipeId: recipe.getId(),
      success: false,
      error: extractErrorMessage(error),
      costUsd: 0,
    };
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

function validateRecipeId(recipeName: string): string {
  return validateAndNormalizeName(recipeName, 'recipe');
}

export function validateCategoryName(categoryName: string): string {
  return validateAndNormalizeName(categoryName, 'category');
}

async function loadExistingRecipeOutputs(): Promise<string[]> {
  try {
    const outputs: string[] = [];
    const config = await chorenzoConfig.readConfig();

    for (const libraryName of Object.keys(config.libraries)) {
      const libraryPath = chorenzoConfig.getLibraryPath(libraryName);

      if (!fs.existsSync(libraryPath)) {
        continue;
      }

      try {
        const library = await parseRecipeLibraryFromDirectory(libraryPath);

        for (const recipe of library.recipes) {
          outputs.push(...recipe.getProvides());
        }
      } catch {
        continue;
      }
    }

    return [...new Set(outputs)].sort();
  } catch (error) {
    Logger.warn(
      { error: extractErrorMessage(error) },
      'Failed to load existing recipe outputs'
    );
    return [];
  }
}

export async function performRecipesGenerate(
  options: RecipesGenerateOptions,
  onProgress?: ProgressCallback
): Promise<RecipesGenerateResult> {
  const startTime = new Date();
  let totalCostUsd = 0;

  try {
    onProgress?.('Starting recipe generation');

    if (!options.name) {
      throw new RecipesError(
        'Recipe name is required. Use: chorenzo recipes generate <name>',
        'MISSING_RECIPE_NAME'
      );
    }

    const recipeName = options.name;
    const recipeId = validateRecipeId(options.name);

    if (!options.category) {
      throw new RecipesError(
        'Category is required. Use --category or provide via interactive prompt',
        'MISSING_CATEGORY'
      );
    }
    const category = validateCategoryName(options.category);

    const summary = options.summary?.trim();
    if (!summary) {
      throw new RecipesError(
        'Summary is required. Use --summary or provide via interactive prompt',
        'MISSING_SUMMARY'
      );
    }

    const baseLocation = options.saveLocation
      ? resolvePath(options.saveLocation)
      : process.cwd();

    const recipePath = libraryManager.determineRecipePath(
      baseLocation,
      category,
      recipeId
    );

    if (fs.existsSync(recipePath)) {
      throw new RecipesError(
        `Recipe "${recipeId}" already exists at ${recipePath}`,
        'RECIPE_ALREADY_EXISTS'
      );
    }

    onProgress?.(`Creating recipe directory: ${recipePath}`);

    fs.mkdirSync(recipePath, { recursive: true });
    fs.mkdirSync(path.join(recipePath, 'variants'), { recursive: true });

    onProgress?.('Creating recipe files');

    const templateVars = {
      recipe_id: recipeId,
      recipe_name: recipeName,
      category,
      summary,
      ...(options.magicGenerate
        ? {}
        : { level: 'workspace-preferred' as const }),
    };

    if (options.magicGenerate) {
      onProgress?.('Generating recipe content with AI');

      const recipeGuidelines = loadDoc('recipes');
      const availableOutputs = await loadExistingRecipeOutputs();

      const templateName = options.ecosystemAgnostic
        ? 'recipe_magic_generate_agnostic'
        : 'recipe_magic_generate';
      const magicPromptTemplate = loadTemplate(templateName);
      const additionalInstructionsText = options.additionalInstructions
        ? `\nAdditional Instructions: ${options.additionalInstructions}`
        : '';

      const magicPrompt = renderPrompt(magicPromptTemplate, {
        recipe_name: recipeName,
        summary,
        category,
        recipe_id: recipeId,
        recipe_path: recipePath,
        recipe_guidelines: recipeGuidelines,
        additional_instructions: additionalInstructionsText,
        available_outputs:
          availableOutputs.length > 0
            ? availableOutputs.map((output) => `- ${output}`).join('\n')
            : '- (No existing recipes found)',
      });

      const operationStartTime = new Date();
      const handlers: CodeChangesEventHandlers = {
        onProgress: (step) => {
          onProgress?.(step, false);
        },
        onThinkingStateChange: (isThinking) => {
          onProgress?.(null, isThinking);
        },
        onComplete: (_result, metadata) => {
          totalCostUsd = metadata?.costUsd || 0;
        },
        showChorenzoOperations: true,
        onError: (error) => {
          throw new RecipesError(
            formatErrorMessage('Magic generation failed', error),
            'MAGIC_GENERATION_FAILED'
          );
        },
      };

      const operationResult = await executeCodeChangesOperation(
        query({
          prompt: magicPrompt,
          options: {
            model: 'sonnet',
            allowedTools: ['Write'],
            permissionMode: 'bypassPermissions',
          },
        }),
        handlers,
        operationStartTime
      );

      if (!operationResult.success) {
        throw new RecipesError(
          operationResult.error || 'Magic generation failed',
          'MAGIC_GENERATION_FAILED'
        );
      }

      totalCostUsd = operationResult.metadata.costUsd;
    } else {
      const metadataTemplate = loadTemplate('recipe_metadata', 'yaml');
      const metadataContent = renderPrompt(metadataTemplate, templateVars);
      fs.writeFileSync(path.join(recipePath, 'metadata.yaml'), metadataContent);

      const promptTemplate = loadTemplate('recipe_prompt');
      const promptContent = renderPrompt(promptTemplate, templateVars);
      fs.writeFileSync(path.join(recipePath, 'prompt.md'), promptContent);

      const fixTemplate = loadTemplate('recipe_fix');
      const fixContent = renderPrompt(fixTemplate, templateVars);
      fs.writeFileSync(path.join(recipePath, 'fix.md'), fixContent);

      if (!options.ecosystemAgnostic) {
        const variantContent = renderPrompt(fixTemplate, templateVars);
        fs.writeFileSync(
          path.join(recipePath, 'variants', 'javascript_default.md'),
          variantContent
        );
      }
    }

    const endTime = new Date();
    const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;

    onProgress?.('Recipe generation complete!');

    return {
      recipePath,
      recipeName: recipeId,
      success: true,
      metadata: {
        costUsd: totalCostUsd,
        durationSeconds,
      },
    };
  } catch (error) {
    if (error instanceof RecipesError) {
      throw error;
    }
    throw new RecipesError(
      formatErrorMessage('Recipe generation failed', error),
      'GENERATION_FAILED'
    );
  }
}

interface WorkspacePreferredResult {
  workspaceResult: RecipesApplyExecutionResult | null;
  projectResults: RecipesApplyExecutionResult[];
}

async function applyWorkspacePreferredRecipe(
  recipe: Recipe,
  analysis: WorkspaceAnalysis,
  options: RecipesApplyOptions,
  onProgress?: RecipesApplyProgressCallback
): Promise<WorkspacePreferredResult> {
  const workspaceEcosystem = analysis.workspaceEcosystem || 'unknown';
  const workspaceState = stateManager.getWorkspaceState();
  const workspaceRecipesApplyState = (workspaceState.workspace ||
    {}) as RecipesApplyState;

  const canApplyAtWorkspace = await canApplyRecipeAtWorkspace(
    recipe,
    analysis,
    workspaceRecipesApplyState
  );

  const applicableProjects = await getApplicableProjectsForWorkspacePreferred(
    recipe,
    analysis,
    workspaceEcosystem,
    workspaceState,
    options.project
  );

  let workspaceResult: RecipesApplyExecutionResult | null = null;
  const projectResults: RecipesApplyExecutionResult[] = [];

  if (canApplyAtWorkspace) {
    onProgress?.('Applying recipe at workspace level', false);

    const variant =
      options.variant ||
      recipe.getDefaultVariant(workspaceEcosystem) ||
      'default';

    workspaceResult = await applyWorkspaceRecipe(
      recipe,
      variant,
      analysis,
      onProgress
    );

    if (workspaceResult.success) {
      onProgress?.(`Successfully applied workspace recipe`);
    } else {
      onProgress?.(
        `Failed to apply workspace recipe: ${workspaceResult.error}`
      );
    }
  }

  if (applicableProjects.length > 0) {
    onProgress?.(
      applicableProjects.length === analysis.projects.length
        ? 'Applying recipe at project level'
        : `Applying recipe to ${applicableProjects.length} specific projects`,
      false
    );

    for (const project of applicableProjects) {
      const variant =
        options.variant ||
        recipe.getDefaultVariant(project.ecosystem || 'unknown') ||
        'default';

      const executionResult = await applyProjectRecipe(
        recipe,
        project,
        variant,
        analysis,
        onProgress
      );

      projectResults.push(executionResult);

      if (executionResult.success) {
        onProgress?.(`Successfully applied to ${executionResult.projectPath}`);
      } else {
        onProgress?.(
          `Failed to apply to ${executionResult.projectPath}: ${executionResult.error}`
        );
      }
    }
  }

  return { workspaceResult, projectResults };
}

async function canApplyRecipeAtWorkspace(
  recipe: Recipe,
  analysis: WorkspaceAnalysis,
  currentState: RecipesApplyState
): Promise<boolean> {
  const workspaceEcosystem = analysis.workspaceEcosystem || 'unknown';

  if (!recipe.hasEcosystem(workspaceEcosystem)) {
    return false;
  }

  const dependencyCheck = await validateDependencies(recipe, currentState);
  return dependencyCheck.satisfied;
}

async function getApplicableProjectsForWorkspacePreferred(
  recipe: Recipe,
  analysis: WorkspaceAnalysis,
  workspaceEcosystem: string,
  workspaceState: WorkspaceState,
  projectFilter?: string
): Promise<ProjectAnalysis[]> {
  const workspaceRecipesApplyState = (workspaceState.workspace ||
    {}) as RecipesApplyState;
  const applicableProjects: ProjectAnalysis[] = [];

  for (const project of analysis.projects) {
    if (projectFilter && !project.path.includes(projectFilter)) {
      continue;
    }

    if (!project.ecosystem) {
      continue;
    }

    if (!recipe.hasEcosystem(project.ecosystem)) {
      continue;
    }

    if (project.ecosystem !== workspaceEcosystem) {
      const relativePath = path.relative(
        workspaceConfig.getWorkspaceRoot(),
        project.path
      );
      const projectState = (workspaceState.projects?.[relativePath] ||
        {}) as RecipesApplyState;

      const dependencyCheck = await validateDependencies(
        recipe,
        projectState,
        project.path
      );

      if (dependencyCheck.satisfied) {
        applicableProjects.push(project);
      }
      continue;
    }

    const relativePath = path.relative(
      workspaceConfig.getWorkspaceRoot(),
      project.path
    );
    const projectState = (workspaceState.projects?.[relativePath] ||
      {}) as RecipesApplyState;

    const requires = recipe.getRequires();
    let shouldInclude = false;

    for (const requirement of requires) {
      if (isReservedKeyword(requirement.key)) {
        const dependencyCheck = await validateDependencies(
          recipe,
          projectState,
          project.path
        );
        if (dependencyCheck.satisfied) {
          shouldInclude = true;
          break;
        }
      } else {
        const workspaceValue = workspaceRecipesApplyState[requirement.key];
        const projectValue = projectState[requirement.key];

        if (
          workspaceValue !== requirement.equals &&
          projectValue === requirement.equals
        ) {
          shouldInclude = true;
          break;
        }
      }
    }

    if (shouldInclude) {
      applicableProjects.push(project);
    }
  }

  return applicableProjects;
}

export async function loadRecipeForShow(recipeName: string): Promise<{
  recipe: Recipe;
  localPath: string;
  isRemote: boolean;
  webUrl?: string;
}> {
  const recipe = await loadRecipe(recipeName);

  const localPath = recipe.path;
  const libraryName = libraryManager.isRemoteLibrary(localPath);
  const isRemote = libraryName !== null;

  let webUrl: string | undefined;
  if (isRemote && libraryName) {
    const config = await chorenzoConfig.readConfig();
    const libraryConfig = config.libraries[libraryName];
    if (libraryConfig?.repo) {
      const repoUrl = libraryConfig.repo;
      if (repoUrl.includes('github.com')) {
        const repoPath = repoUrl
          .replace(/\.git$/, '')
          .replace('https://github.com/', '');
        const recipePath = path.relative(
          chorenzoConfig.getLibraryPath(libraryName),
          localPath
        );
        webUrl = `https://github.com/${repoPath}/tree/${libraryConfig.ref}/${recipePath}`;
      }
    }
  }

  return {
    recipe,
    localPath,
    isRemote,
    webUrl,
  };
}

export async function getRecipeCategories(): Promise<string[]> {
  try {
    return await libraryManager.getAllCategories();
  } catch (error) {
    throw new RecipesError(
      `Failed to get recipe categories: ${error instanceof Error ? error.message : String(error)}`,
      'CATEGORIES_FAILED'
    );
  }
}

export async function getRecipesByCategory(
  category: string
): Promise<Recipe[]> {
  try {
    return await libraryManager.getRecipesByCategory(category);
  } catch (error) {
    throw new RecipesError(
      `Failed to get recipes for category '${category}': ${error instanceof Error ? error.message : String(error)}`,
      'RECIPES_BY_CATEGORY_FAILED'
    );
  }
}
