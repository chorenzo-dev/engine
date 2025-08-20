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
