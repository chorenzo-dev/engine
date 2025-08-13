import { BaseContainerOptions, OperationMetadata } from './common';
import { Recipe } from './recipe';

export interface RecipesShowOptions {
  recipe: string;
  progress?: boolean;
  debug?: boolean;
}

export type RecipeShowActionType = 'apply' | 'exit';

export interface RecipeShowAction {
  type: RecipeShowActionType;
  label: string;
}

export interface RecipeLocationInfo {
  localPath: string;
  isRemote: boolean;
  webUrl?: string;
}

export interface RecipeShowDisplayInfo {
  recipe: Recipe;
  location: RecipeLocationInfo;
  actions: RecipeShowAction[];
}

export interface RecipeShowContainerOptions extends BaseContainerOptions {
  interactive?: boolean;
}

export interface RecipeShowResult {
  recipe: Recipe;
  selectedAction?: RecipeShowActionType;
  shouldProceed: boolean;
  metadata: OperationMetadata;
}

export class RecipeShowError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'RecipeShowError';
  }
}

export type RecipeShowProgressCallback = (
  step: string | null,
  isThinking?: boolean
) => void;
