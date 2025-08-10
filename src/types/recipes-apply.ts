import { OperationMetadata } from './common';
import { Recipe, RecipeDependency } from './recipe';

export interface RecipesApplyOptions {
  recipe: string;
  variant?: string;
  project?: string;
  yes?: boolean;
}

export interface RecipesApplyState {
  [key: string]: string | boolean;
}

export interface RecipesApplyDependencyValidationResult {
  satisfied: boolean;
  missing: RecipeDependency[];
  conflicting: Array<{
    key: string;
    required: string;
    current: string;
  }>;
}

export interface RecipesApplyExecutionResult {
  projectPath: string;
  recipeId: string;
  success: boolean;
  error?: string;
  costUsd: number;
  output?: string;
}

export interface RecipesApplyResult {
  recipe: Recipe;
  dependencyCheck: RecipesApplyDependencyValidationResult;
  executionResults: RecipesApplyExecutionResult[];
  summary: {
    totalProjects: number;
    successfulProjects: number;
    failedProjects: number;
    skippedProjects: number;
  };
  metadata: OperationMetadata;
}

export class RecipesApplyError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'RecipesApplyError';
  }
}

export type RecipesApplyProgressCallback = (
  step: string | null,
  isThinking?: boolean
) => void;
