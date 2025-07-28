import { OperationMetadata } from './common';
import { Recipe, RecipeDependency } from './recipe';

export interface ApplyOptions {
  recipe: string;
  variant?: string;
  project?: string;
  yes?: boolean;
  progress?: boolean;
  cost?: boolean;
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
  error?: string;
  costUsd: number;
}

export interface ApplyRecipeResult {
  recipe: Recipe;
  dependencyCheck: DependencyValidationResult;
  executionResults: ExecutionResult[];
  summary: {
    totalProjects: number;
    successfulProjects: number;
    failedProjects: number;
    skippedProjects: number;
  };
  metadata: OperationMetadata;
}

export type ApplyResult = ApplyRecipeResult;

export class ApplyError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'ApplyError';
  }
}

export type ApplyProgressCallback = (
  step: string | null,
  isThinking?: boolean
) => void;
export type ApplyValidationCallback = (
  type: 'info' | 'success' | 'error' | 'warning',
  message: string
) => void;
