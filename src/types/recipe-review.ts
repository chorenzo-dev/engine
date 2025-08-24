import { InputType, ProgressCallback } from '~/commands/recipes.shared';
import { CodeSampleValidationResult } from '~/types/recipe';

export interface ReviewOptions extends Record<string, unknown> {
  target: string;
}

export interface ReviewMessage {
  type: 'info' | 'success' | 'error' | 'warning';
  text: string;
}

export interface ReviewContext {
  inputType: InputType;
  target: string;
  resolvedPath?: string;
  recipesReviewed?: string[];
}

export interface ReviewSummary {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
}

export interface ReviewResult {
  context: ReviewContext;
  messages: ReviewMessage[];
  summary?: ReviewSummary;
}

export interface RecipeReviewResult {
  recipeId: string;
  codeSampleValidation?: CodeSampleValidationResult;
  passed: boolean;
  messages: ReviewMessage[];
  errors: number;
  warnings: number;
}

export type ReviewCallback = (
  type: 'info' | 'success' | 'error' | 'warning',
  message: string
) => void;

export type ReviewProgressCallback = ProgressCallback;
