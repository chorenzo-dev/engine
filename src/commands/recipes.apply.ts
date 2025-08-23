import { query } from '@anthropic-ai/claude-code';
import * as fs from 'fs';
import * as path from 'path';

import { icons } from '~/styles/icons';
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
import { GitignoreManager } from '~/utils/gitignore.utils';
import { readJson } from '~/utils/json.utils';
import { Logger } from '~/utils/logger.utils';
import {
  findProjectByPath,
  getProjectCharacteristic,
  getWorkspaceCharacteristic,
  isProjectKeyword,
  isReservedKeyword,
  isWorkspaceKeyword,
  loadWorkspaceAnalysis,
} from '~/utils/project-characteristics.utils';
import { loadPrompt, renderPrompt } from '~/utils/prompts.utils';
import { stateManager } from '~/utils/state-manager.utils';
import { workspaceConfig } from '~/utils/workspace-config.utils';

import { extractErrorMessage, formatErrorMessage } from '../utils/error.utils';
import { performAnalysis } from './analyze';
import { loadRecipe } from './recipes.shared';

function validateRecipeStructure(recipe: Recipe): void {
  const validationResult = recipe.validate();
  if (!validationResult.valid) {
    const errors = validationResult.errors.map((e) => e.message).join(', ');
    throw new RecipesApplyError(
      `Recipe validation failed: ${errors}`,
      'RECIPE_INVALID'
    );
  }
}

interface RecipeSetupResult {
  recipe: Recipe;
  analysis: WorkspaceAnalysis;
  currentState: RecipesApplyState;
  dependencyCheck: RecipesApplyDependencyValidationResult;
}

async function setupRecipeApplication(
  options: RecipesApplyOptions,
  onProgress?: RecipesApplyProgressCallback
): Promise<RecipeSetupResult> {
  onProgress?.('Loading recipe');
  const recipe = await loadRecipe(options.recipe);

  onProgress?.('Validating recipe structure');
  validateRecipeStructure(recipe);

  onProgress?.('Ensuring analysis data');
  const analysis = await ensureAnalysisData();

  onProgress?.('Checking recipe dependencies');
  const currentState = readCurrentState();
  const dependencyCheck = validateWorkspaceDependencies(recipe, currentState);

  if (!dependencyCheck.satisfied && !options.force) {
    const errorMsg = formatDependencyError(recipe.getId(), dependencyCheck);
    throw new RecipesApplyError(errorMsg, 'DEPENDENCIES_NOT_SATISFIED');
  }

  if (!dependencyCheck.satisfied && options.force) {
    Logger.warn(
      {
        event: 'force_flag_bypassed_validation',
        recipeId: recipe.getId(),
        unsatisfiedDependencies: {
          missing: dependencyCheck.missing.length,
          conflicting: dependencyCheck.conflicting.length,
        },
      },
      'WARNING: --force flag is bypassing validation requirements. Recipe may not work as expected.'
    );
    onProgress?.('⚠️  Bypassing validation due to --force flag');
  }

  return { recipe, analysis, currentState, dependencyCheck };
}

export async function checkRecipeReApplication(
  options: RecipesApplyOptions,
  onProgress?: RecipesApplyProgressCallback
): Promise<{ recipeId: string; reApplicationCheck: ReApplicationCheckResult }> {
  const { recipe, analysis } = await setupRecipeApplication(
    options,
    onProgress
  );

  onProgress?.('Checking for previous recipe applications');
  const reApplicationCheck = checkReApplication(recipe, analysis, options);

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
    const { recipe, analysis, dependencyCheck } = await setupRecipeApplication(
      options,
      onProgress
    );

    onProgress?.('Checking for previous recipe applications');
    const reApplicationCheck = checkReApplication(recipe, analysis, options);

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
      const {
        workspaceResult,
        projectResults,
        canApplyAtWorkspace,
        applicableProjectsCount,
        workspaceFailureReason,
      } = await applyWorkspacePreferredRecipe(
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
        const workspaceError =
          workspaceResult?.error ||
          (canApplyAtWorkspace ? 'execution failed' : workspaceFailureReason);
        const projectFailureReasons =
          projectResults.length > 0
            ? projectResults.map((p) => p.error).filter(Boolean)
            : ['no applicable projects found'];

        Logger.error(
          {
            recipeId: recipe.getId(),
            workspaceCanApply: canApplyAtWorkspace,
            workspaceFailureReason: workspaceError,
            projectResultsCount: projectResults.length,
            projectFailureReasons,
            applicableProjectsCount,
          },
          'Recipe application failed at all levels'
        );

        const detailedError =
          applicableProjectsCount === 0
            ? `Recipe '${recipe.getId()}' cannot be applied: workspace ${workspaceError}, no applicable projects found`
            : `Recipe '${recipe.getId()}' failed: workspace ${workspaceError}, projects failed: ${projectFailureReasons.join(', ')}`;

        throw new RecipesApplyError(detailedError, 'NO_APPLICABLE_SCOPE');
      }
    } else {
      onProgress?.('Filtering applicable projects');
      const applicableProjects = filterApplicableProjects(
        analysis,
        recipe,
        options.project,
        options.force
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

export function readCurrentState(): RecipesApplyState {
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

function validateDependencies(
  recipe: Recipe,
  currentState: RecipesApplyState,
  projectPath?: string
): RecipesApplyDependencyValidationResult {
  const missing: RecipeDependency[] = [];
  const conflicting: Array<{ key: string; required: string; current: string }> =
    [];

  let analysis: WorkspaceAnalysis | null = null;
  let project: ProjectAnalysis | undefined;

  for (const dependency of recipe.getRequires()) {
    let currentValue: string | undefined;

    if (isReservedKeyword(dependency.key)) {
      if (isProjectKeyword(dependency.key) && !projectPath) {
        continue;
      }

      if (!analysis) {
        analysis = loadWorkspaceAnalysis();
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

export function validateWorkspaceDependencies(
  recipe: Recipe,
  currentState: RecipesApplyState
): RecipesApplyDependencyValidationResult {
  return validateDependencies(recipe, currentState);
}

function formatDependencyError(
  recipeId: string,
  validationResult: RecipesApplyDependencyValidationResult
): string {
  const lines = [
    `Recipe '${recipeId}' cannot be applied due to unmet requirements:`,
  ];
  lines.push('');

  if (validationResult.missing.length > 0) {
    lines.push('Missing requirements:');
    for (const dep of validationResult.missing) {
      lines.push(
        `  ${icons.bullet} ${dep.key}: ${formatDependencyDescription(dep)}`
      );
      lines.push(`    ${icons.arrow} ${formatActionSuggestion(dep)}`);
    }
  }

  if (validationResult.conflicting.length > 0) {
    if (validationResult.missing.length > 0) {
      lines.push('');
    }
    lines.push('Mismatched values:');
    for (const conflict of validationResult.conflicting) {
      lines.push(
        `  ${icons.bullet} ${conflict.key}: Recipe expects '${conflict.required}' but your workspace has '${conflict.current}'`
      );
      lines.push(`    ${icons.arrow} ${formatConflictSuggestion(conflict)}`);
    }
  }

  return lines.join('\n');
}

function formatDependencyDescription(dep: RecipeDependency): string {
  if (dep.key.startsWith('prerequisite.')) {
    const feature = dep.key.replace('prerequisite.', '');
    return `This recipe requires '${feature}' to be configured first`;
  }

  if (dep.key.startsWith('workspace.')) {
    const characteristic = dep.key.replace('workspace.', '');
    if (characteristic === 'is_monorepo') {
      return dep.equals === 'true'
        ? 'This recipe requires a monorepo workspace setup'
        : 'This recipe requires a single-project workspace setup';
    }
    return `This recipe requires the workspace ${characteristic} to be '${dep.equals}'`;
  }

  if (dep.key.startsWith('project.')) {
    const characteristic = dep.key.replace('project.', '');
    if (characteristic === 'ecosystem') {
      return `This recipe requires projects with '${dep.equals}' ecosystem`;
    }
    if (characteristic === 'type') {
      return `This recipe requires projects of type '${dep.equals}'`;
    }
    if (characteristic === 'framework') {
      return `This recipe requires projects using '${dep.equals}' framework`;
    }
    return `This recipe requires projects with ${characteristic} set to '${dep.equals}'`;
  }

  return `This recipe requires '${dep.key}' to be set to '${dep.equals}'`;
}

function formatActionSuggestion(dep: RecipeDependency): string {
  if (dep.key.startsWith('prerequisite.')) {
    const feature = dep.key.replace('prerequisite.', '');
    return `Run 'chorenzo recipes apply ${feature}' to set this up`;
  }

  if (dep.key.startsWith('workspace.')) {
    const characteristic = dep.key.replace('workspace.', '');
    if (characteristic === 'is_monorepo') {
      return dep.equals === 'true'
        ? 'This recipe is designed for monorepo setups'
        : 'This recipe is designed for single-project setups';
    }
    return `Check your workspace configuration for ${characteristic}`;
  }

  if (dep.key.startsWith('project.')) {
    const characteristic = dep.key.replace('project.', '');
    if (characteristic === 'ecosystem') {
      return `Make sure you have projects using the '${dep.equals}' ecosystem`;
    }
    if (characteristic === 'type') {
      return `This recipe only applies to '${dep.equals}' type projects`;
    }
    if (characteristic === 'framework') {
      return `This recipe only applies to projects using '${dep.equals}' framework`;
    }
    return `Ensure your projects have the correct ${characteristic} configuration`;
  }

  return `Set up the required ${dep.key} configuration`;
}

function formatConflictSuggestion(conflict: {
  key: string;
  required: string;
  current: string;
}): string {
  if (conflict.key.startsWith('workspace.')) {
    const characteristic = conflict.key.replace('workspace.', '');
    if (characteristic === 'is_monorepo') {
      return conflict.required === 'true'
        ? 'This recipe is designed for monorepo setups'
        : 'This recipe is designed for single-project setups';
    }
    return `This recipe requires ${characteristic} to be '${conflict.required}'`;
  }

  if (conflict.key.startsWith('project.')) {
    const characteristic = conflict.key.replace('project.', '');
    return `This recipe requires ${characteristic} to be '${conflict.required}'`;
  }

  return `Update ${conflict.key} to '${conflict.required}' or use a different recipe variant`;
}

function checkReApplication(
  recipe: Recipe,
  analysis: WorkspaceAnalysis,
  options: RecipesApplyOptions
): ReApplicationCheckResult {
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

    const canApplyAtWorkspace = canApplyRecipeAtWorkspace(
      recipe,
      analysis,
      workspaceRecipesApplyState,
      options.force
    );

    if (
      canApplyAtWorkspace &&
      stateManager.isRecipeApplied(recipeId, 'workspace')
    ) {
      targets.push({ level: 'workspace' });
    }

    const applicableProjects = getApplicableProjectsForWorkspacePreferred(
      recipe,
      analysis,
      workspaceEcosystem,
      workspaceState,
      options.project,
      options.force
    );

    for (const project of applicableProjects) {
      if (stateManager.isRecipeApplied(recipeId, 'project', project.path)) {
        targets.push({ level: 'project', path: project.path });
      }
    }
  } else {
    const applicableProjects = filterApplicableProjects(
      analysis,
      recipe,
      options.project,
      options.force
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
    userConfirmedProceed:
      !hasAlreadyApplied || Boolean(options.yes) || Boolean(options.force),
  };
}

function filterProjectsByName(
  projects: ProjectAnalysis[],
  projectFilter?: string
): ProjectAnalysis[] {
  if (!projectFilter) {
    return projects;
  }

  return projects.filter(
    (p) => p.path === projectFilter || p.path.includes(projectFilter)
  );
}

function shouldIncludeProject(
  project: ProjectAnalysis,
  recipe: Recipe,
  projectFilter?: string
): boolean {
  if (projectFilter && !project.path.includes(projectFilter)) {
    return false;
  }

  if (!project.ecosystem) {
    return false;
  }

  if (!recipe.hasEcosystem(project.ecosystem)) {
    return false;
  }

  return true;
}

function filterApplicableProjects(
  analysis: WorkspaceAnalysis,
  recipe: Recipe,
  projectFilter?: string,
  force?: boolean
): ProjectAnalysis[] {
  const projects = filterProjectsByName(analysis.projects, projectFilter);
  const applicableProjects: ProjectAnalysis[] = [];
  const workspaceState = stateManager.getWorkspaceState();

  for (const project of projects) {
    if (!shouldIncludeProject(project, recipe, projectFilter)) {
      continue;
    }

    const relativePath = path.relative(
      workspaceConfig.getWorkspaceRoot(),
      project.path
    );
    const projectState = (workspaceState.projects?.[relativePath] ||
      {}) as RecipesApplyState;

    const dependencyCheck = validateDependencies(
      recipe,
      projectState,
      project.path
    );

    if (dependencyCheck.satisfied || force) {
      applicableProjects.push(project);

      if (!dependencyCheck.satisfied && force) {
        Logger.warn(
          {
            event: 'force_flag_bypassed_project_validation',
            recipeId: recipe.getId(),
            projectPath: project.path,
            unsatisfiedDependencies: {
              missing: dependencyCheck.missing.length,
              conflicting: dependencyCheck.conflicting.length,
            },
          },
          `WARNING: --force bypassing validation for project ${project.path}`
        );
      }
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

interface WorkspacePreferredResult {
  workspaceResult: RecipesApplyExecutionResult | null;
  projectResults: RecipesApplyExecutionResult[];
  canApplyAtWorkspace: boolean;
  applicableProjectsCount: number;
  workspaceFailureReason: string;
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

  const workspaceApplicability = getWorkspaceApplicabilityResult(
    recipe,
    analysis,
    workspaceRecipesApplyState,
    options.force
  );
  const canApplyAtWorkspace = workspaceApplicability.canApply;

  const applicableProjects = getApplicableProjectsForWorkspacePreferred(
    recipe,
    analysis,
    workspaceEcosystem,
    workspaceState,
    options.project,
    options.force
  );

  Logger.info(
    {
      recipeId: recipe.getId(),
      canApplyAtWorkspace,
      workspaceEcosystem,
      applicableProjectsCount: applicableProjects.length,
      totalProjectsCount: analysis.projects.length,
      projectFilter: options.project,
    },
    'Recipe application scope analysis'
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

  return {
    workspaceResult,
    projectResults,
    canApplyAtWorkspace,
    applicableProjectsCount: applicableProjects.length,
    workspaceFailureReason: workspaceApplicability.reason,
  };
}

interface WorkspaceApplicabilityResult {
  canApply: boolean;
  reason: string;
}

function canApplyRecipeAtWorkspace(
  recipe: Recipe,
  analysis: WorkspaceAnalysis,
  currentState: RecipesApplyState,
  force?: boolean
): boolean {
  const result = getWorkspaceApplicabilityResult(
    recipe,
    analysis,
    currentState,
    force
  );
  return result.canApply;
}

function getWorkspaceApplicabilityResult(
  recipe: Recipe,
  analysis: WorkspaceAnalysis,
  currentState: RecipesApplyState,
  force?: boolean
): WorkspaceApplicabilityResult {
  const workspaceEcosystem = analysis.workspaceEcosystem || 'unknown';

  if (!recipe.hasEcosystem(workspaceEcosystem)) {
    const supportedEcosystems = recipe.getEcosystems().map((e) => e.id);
    const reason =
      supportedEcosystems.length > 0
        ? `ecosystem mismatch (workspace: ${workspaceEcosystem}, recipe supports: ${supportedEcosystems.join(', ')})`
        : `ecosystem mismatch (workspace: ${workspaceEcosystem}, recipe is ecosystem-agnostic but failed)`;

    Logger.info(
      {
        recipeId: recipe.getId(),
        workspaceEcosystem,
        recipeEcosystems: supportedEcosystems,
        reason: 'ECOSYSTEM_NOT_SUPPORTED',
      },
      'Recipe cannot apply at workspace level: ecosystem mismatch'
    );
    return { canApply: false, reason };
  }

  const dependencyCheck = validateDependencies(recipe, currentState);
  if (!dependencyCheck.satisfied && !force) {
    const unsatisfiedDeps = dependencyCheck.missing.map((d) => d.key);
    const reason = `dependencies not satisfied: ${unsatisfiedDeps.join(', ')}`;

    Logger.info(
      {
        recipeId: recipe.getId(),
        workspaceEcosystem,
        dependencyCheck,
        reason: 'DEPENDENCIES_NOT_SATISFIED',
      },
      'Recipe cannot apply at workspace level: dependencies not satisfied'
    );
    return { canApply: false, reason };
  }

  if (!dependencyCheck.satisfied && force) {
    Logger.warn(
      {
        event: 'force_flag_bypassed_workspace_validation',
        recipeId: recipe.getId(),
        workspaceEcosystem,
        unsatisfiedDependencies: {
          missing: dependencyCheck.missing.length,
          conflicting: dependencyCheck.conflicting.length,
        },
      },
      'WARNING: --force bypassing workspace-level validation requirements'
    );
  }

  Logger.info(
    {
      recipeId: recipe.getId(),
      workspaceEcosystem,
    },
    'Recipe can apply at workspace level'
  );
  return { canApply: true, reason: 'applicable' };
}

function getApplicableProjectsForWorkspacePreferred(
  recipe: Recipe,
  analysis: WorkspaceAnalysis,
  workspaceEcosystem: string,
  workspaceState: WorkspaceState,
  projectFilter?: string,
  force?: boolean
): ProjectAnalysis[] {
  const workspaceRecipesApplyState = (workspaceState.workspace ||
    {}) as RecipesApplyState;
  const applicableProjects: ProjectAnalysis[] = [];

  for (const project of analysis.projects) {
    if (!shouldIncludeProject(project, recipe, projectFilter)) {
      continue;
    }

    if (project.ecosystem !== workspaceEcosystem) {
      const relativePath = path.relative(
        workspaceConfig.getWorkspaceRoot(),
        project.path
      );
      const projectState = (workspaceState.projects?.[relativePath] ||
        {}) as RecipesApplyState;

      const dependencyCheck = validateDependencies(
        recipe,
        projectState,
        project.path
      );

      if (dependencyCheck.satisfied || force) {
        applicableProjects.push(project);

        if (!dependencyCheck.satisfied && force) {
          Logger.warn(
            {
              event: 'force_flag_bypassed_workspace_preferred_validation',
              recipeId: recipe.getId(),
              projectPath: project.path,
              unsatisfiedDependencies: {
                missing: dependencyCheck.missing.length,
                conflicting: dependencyCheck.conflicting.length,
              },
            },
            `WARNING: --force bypassing validation for workspace-preferred project ${project.path}`
          );
        }
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
        const dependencyCheck = validateDependencies(
          recipe,
          projectState,
          project.path
        );
        if (dependencyCheck.satisfied || force) {
          shouldInclude = true;

          if (!dependencyCheck.satisfied && force) {
            Logger.warn(
              {
                event:
                  'force_flag_bypassed_workspace_preferred_reserved_keyword_validation',
                recipeId: recipe.getId(),
                projectPath: project.path,
                requirement: requirement.key,
                unsatisfiedDependencies: {
                  missing: dependencyCheck.missing.length,
                  conflicting: dependencyCheck.conflicting.length,
                },
              },
              `WARNING: --force bypassing reserved keyword validation for project ${project.path}`
            );
          }
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
