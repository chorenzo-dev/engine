import { InputType } from '~/commands/recipes.shared';

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

export type ReviewCallback = (
  type: 'info' | 'success' | 'error' | 'warning',
  message: string
) => void;
