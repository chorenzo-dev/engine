import { BaseContainerOptions } from './common';

export interface RecipeLocationInfo {
  localPath: string;
  isRemote: boolean;
  webUrl?: string;
}

export interface RecipeShowContainerOptions extends BaseContainerOptions {
  recipeName: string;
}
