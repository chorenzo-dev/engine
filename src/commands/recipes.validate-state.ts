import { icons } from '../styles/icons';
import {
  ValidationError,
  ValidationResult,
  formatValidationErrors,
} from '../utils/analyze.utils';
import { JsonError, readJson } from '../utils/json.utils';
import { Logger } from '../utils/logger.utils';
import { workspaceConfig } from '../utils/workspace-config.utils';
import { loadRecipe } from './recipes.shared';

export interface RecipesValidateStateOptions {
  recipe: string;
  debug?: boolean;
}

interface StateValidationResult extends ValidationResult {
  missingProvides: string[];
}

interface StateFile {
  workspace?: Record<string, unknown>;
  projects?: Record<string, Record<string, unknown>>;
}

export async function recipesValidateState(
  options: RecipesValidateStateOptions,
  onProgress?: (message: string) => void
): Promise<void> {
  Logger.info(`Starting state validation for recipe: ${options.recipe}`);

  onProgress?.(`Loading recipe`);
  if (options.debug) {
    onProgress?.(`Loading recipe: ${options.recipe}`);
  }

  let recipe;
  try {
    recipe = await loadRecipe(options.recipe);
  } catch (error) {
    const errorMessage = `Failed to load recipe '${options.recipe}': ${
      error instanceof Error ? error.message : String(error)
    }`;
    Logger.error(errorMessage);
    onProgress?.(`${icons.error} ${errorMessage}`);
    throw new Error(errorMessage);
  }

  onProgress?.(`Getting recipe provides`);
  const provides = recipe.getProvides();
  if (options.debug) {
    onProgress?.(`Recipe provides: ${provides.join(', ')}`);
  }

  if (provides.length === 0) {
    onProgress?.(`${icons.success} Recipe has no provides to validate`);
    Logger.info('Recipe has no provides, validation passed');
    return;
  }

  onProgress?.(`Reading state file`);
  const statePath = workspaceConfig.getStatePath();
  if (options.debug) {
    onProgress?.(`State file path: ${statePath}`);
  }

  const result = validateStateFile(statePath, provides, recipe.getLevel());

  if (result.valid) {
    onProgress?.(`${icons.success} Recipe state is valid`);
    Logger.info('State validation passed successfully');
    if (options.debug) {
      onProgress?.(`All ${provides.length} provides found in state file`);
    }
  } else {
    onProgress?.(`${icons.error} Recipe state validation failed`);
    const errorMessage = formatValidationErrors(result.errors);
    onProgress?.(errorMessage);

    Logger.error(
      `State validation failed with ${result.errors.length} error${
        result.errors.length === 1 ? '' : 's'
      }`
    );
    if (options.debug) {
      onProgress?.(`Missing provides: ${result.missingProvides.join(', ')}`);
      result.errors.forEach((error, index) => {
        onProgress?.(
          `Error ${index + 1}: ${error.path} - ${error.message} (${error.code})`
        );
      });
    }

    throw new Error(`Missing provides: ${result.missingProvides.join(', ')}`);
  }
}

function validateStateFile(
  statePath: string,
  provides: string[],
  recipeLevel: string
): StateValidationResult {
  let stateData: StateFile;

  try {
    stateData = readJson<StateFile>(statePath);
  } catch (error) {
    if (error instanceof JsonError && error.code === 'FILE_NOT_FOUND') {
      return {
        valid: false,
        errors: [
          {
            path: 'file',
            message: `State file not found: ${statePath}`,
            code: 'FILE_NOT_FOUND',
          },
        ],
        missingProvides: provides,
      };
    }
    if (error instanceof JsonError && error.code === 'PARSE_ERROR') {
      return {
        valid: false,
        errors: [
          {
            path: 'file',
            message: `Invalid JSON in state file: ${error.message}`,
            code: 'INVALID_JSON',
          },
        ],
        missingProvides: provides,
      };
    }
    return {
      valid: false,
      errors: [
        {
          path: 'file',
          message: `Failed to read state file: ${
            error instanceof Error ? error.message : String(error)
          }`,
          code: 'READ_ERROR',
        },
      ],
      missingProvides: provides,
    };
  }

  if (!stateData || typeof stateData !== 'object') {
    return {
      valid: false,
      errors: [
        {
          path: 'root',
          message: 'State file must be a valid JSON object',
          code: 'INVALID_FORMAT',
        },
      ],
      missingProvides: provides,
    };
  }

  const errors: ValidationError[] = [];
  const missingProvides: string[] = [];

  for (const provide of provides) {
    if (!isProvideInState(provide, stateData, recipeLevel)) {
      missingProvides.push(provide);
    }
  }

  if (missingProvides.length > 0) {
    errors.push({
      path: 'provides',
      message: `Missing provides in state file: ${missingProvides.join(', ')}`,
      code: 'MISSING_PROVIDES',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    missingProvides,
  };
}

function isProvideInState(
  provide: string,
  stateData: StateFile,
  recipeLevel: string
): boolean {
  const isWorkspaceLevel =
    recipeLevel === 'workspace-only' || recipeLevel === 'workspace-preferred';
  const isProjectLevel =
    recipeLevel === 'project-only' || recipeLevel === 'workspace-preferred';

  if (isWorkspaceLevel && stateData.workspace) {
    if (provide in stateData.workspace) {
      return true;
    }
  }

  if (isProjectLevel && stateData.projects) {
    for (const projectState of Object.values(stateData.projects)) {
      if (
        projectState &&
        typeof projectState === 'object' &&
        provide in projectState
      ) {
        return true;
      }
    }
  }

  return false;
}
