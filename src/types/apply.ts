import { Recipe, RecipeDependency } from './recipe';
import { WorkspaceAnalysis, ProjectAnalysis } from './analysis';
import { OperationMetadata } from './common';

export interface ApplyOptions {
  recipe: string;
  variant?: string;
  project?: string;
  yes?: boolean;
  progress?: boolean;
}

export interface RecipeState {
  [key: string]: string | boolean;
}

export interface DependencyValidationResult {
  satisfied: boolean;
  missing: RecipeDependency[];
  conflicting: Array<{
    key: string;
    required: string;
    current: string;
  }>;
}

export interface ExecutionResult {
  projectPath: string;
  recipeId: string;
  success: boolean;
  outputs?: Record<string, string | boolean>;
  error?: string;
  costUsd: number;
}

export interface ApplyRecipeResult {
  recipe: Recipe;
  dependencyCheck: DependencyValidationResult;
  executionResults: ExecutionResult[];
  stateUpdated: boolean;
  summary: {
    totalProjects: number;
    successfulProjects: number;
    failedProjects: number;
    skippedProjects: number;
  };
  metadata: OperationMetadata;
}

export interface ApplyResult extends ApplyRecipeResult {}

export class ApplyError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'ApplyError';
  }
}

export type ApplyProgressCallback = (step: string) => void;
export type ApplyValidationCallback = (
  type: 'info' | 'success' | 'error' | 'warning',
  message: string
) => void;
