import { Recipe, RecipeDependency } from './recipe';
import { WorkspaceAnalysis, ProjectAnalysis } from './analysis';

export interface ApplyOptions {
  recipe: string;
  variant?: string;
  project?: string;
  yes?: boolean;
  progress?: boolean;
}

export interface StateEntry {
  value: string | boolean;
  source: string;
  timestamp: string;
}

export interface RecipeState {
  [key: string]: StateEntry;
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

export interface PlanGenerationContext {
  recipe: Recipe;
  project: ProjectAnalysis;
  variant: string;
  workspaceRoot: string;
  analysis: WorkspaceAnalysis;
}

export interface PlanResult {
  projectPath: string;
  recipeId: string;
  variant: string;
  planContent: string;
  planPath: string;
  success: boolean;
  error?: string;
}

export interface ExecutionResult {
  projectPath: string;
  recipeId: string;
  success: boolean;
  outputs?: Record<string, string | boolean>;
  error?: string;
  logPath?: string;
}

export interface ApplyResult {
  recipe: Recipe;
  dependencyCheck: DependencyValidationResult;
  planResults: PlanResult[];
  executionResults: ExecutionResult[];
  stateUpdated: boolean;
  summary: {
    totalProjects: number;
    successfulProjects: number;
    failedProjects: number;
    skippedProjects: number;
  };
}

export class ApplyError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'ApplyError';
  }
}

export type ApplyProgressCallback = (step: string) => void;
export type ApplyValidationCallback = (type: 'info' | 'success' | 'error' | 'warning', message: string) => void;