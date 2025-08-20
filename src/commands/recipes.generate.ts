import { query } from '@anthropic-ai/claude-code';
import * as fs from 'fs';
import * as path from 'path';

import {
  CodeChangesEventHandlers,
  executeCodeChangesOperation,
} from '~/utils/code-changes-events.utils';
import { chorenzoConfig } from '~/utils/config.utils';
import { extractErrorMessage, formatErrorMessage } from '~/utils/error.utils';
import { libraryManager } from '~/utils/library-manager.utils';
import { Logger } from '~/utils/logger.utils';
import { resolvePath } from '~/utils/path.utils';
import { loadDoc, loadTemplate, renderPrompt } from '~/utils/prompts.utils';
import { parseRecipeLibraryFromDirectory } from '~/utils/recipe.utils';

import {
  RecipesError,
  validateCategoryName,
  validateRecipeId,
} from './recipes.validate';

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

export type ProgressCallback = (
  step: string | null,
  isThinking?: boolean
) => void;

async function loadExistingRecipeOutputs(): Promise<string[]> {
  try {
    const outputs: string[] = [];
    const config = await chorenzoConfig.readConfig();

    for (const libraryName of Object.keys(config.libraries)) {
      const libraryPath = chorenzoConfig.getLibraryPath(libraryName);

      if (!fs.existsSync(libraryPath)) {
        continue;
      }

      try {
        const library = await parseRecipeLibraryFromDirectory(libraryPath);

        for (const recipe of library.recipes) {
          outputs.push(...recipe.getProvides());
        }
      } catch {
        continue;
      }
    }

    return [...new Set(outputs)].sort();
  } catch (error) {
    Logger.warn(
      { error: extractErrorMessage(error) },
      'Failed to load existing recipe outputs'
    );
    return [];
  }
}

export async function performRecipesGenerate(
  options: RecipesGenerateOptions,
  onProgress?: ProgressCallback
): Promise<RecipesGenerateResult> {
  const startTime = new Date();
  let totalCostUsd = 0;

  try {
    onProgress?.('Starting recipe generation');

    if (!options.name) {
      throw new RecipesError(
        'Recipe name is required. Use: chorenzo recipes generate <name>',
        'MISSING_RECIPE_NAME'
      );
    }

    const recipeName = options.name;
    const recipeId = validateRecipeId(options.name);

    if (!options.category) {
      throw new RecipesError(
        'Category is required. Use --category or provide via interactive prompt',
        'MISSING_CATEGORY'
      );
    }
    const category = validateCategoryName(options.category);

    const summary = options.summary?.trim();
    if (!summary) {
      throw new RecipesError(
        'Summary is required. Use --summary or provide via interactive prompt',
        'MISSING_SUMMARY'
      );
    }

    const baseLocation = options.saveLocation
      ? resolvePath(options.saveLocation)
      : process.cwd();

    const recipePath = libraryManager.determineRecipePath(
      baseLocation,
      category,
      recipeId
    );

    if (fs.existsSync(recipePath)) {
      throw new RecipesError(
        `Recipe "${recipeId}" already exists at ${recipePath}`,
        'RECIPE_ALREADY_EXISTS'
      );
    }

    onProgress?.(`Creating recipe directory: ${recipePath}`);

    fs.mkdirSync(recipePath, { recursive: true });
    fs.mkdirSync(path.join(recipePath, 'variants'), { recursive: true });

    onProgress?.('Creating recipe files');

    const templateVars = {
      recipe_id: recipeId,
      recipe_name: recipeName,
      category,
      summary,
      ...(options.magicGenerate
        ? {}
        : { level: 'workspace-preferred' as const }),
    };

    if (options.magicGenerate) {
      onProgress?.('Generating recipe content with AI');

      const recipeGuidelines = loadDoc('recipes');
      const availableOutputs = await loadExistingRecipeOutputs();

      const templateName = options.ecosystemAgnostic
        ? 'recipe_magic_generate_agnostic'
        : 'recipe_magic_generate';
      const magicPromptTemplate = loadTemplate(templateName);

      const additionalInstructionsText = options.additionalInstructions
        ? `\nAdditional Instructions: ${options.additionalInstructions}`
        : '';

      const magicPrompt = renderPrompt(magicPromptTemplate, {
        recipe_name: recipeName,
        summary,
        category,
        recipe_id: recipeId,
        recipe_path: recipePath,
        recipe_guidelines: recipeGuidelines,
        additional_instructions: additionalInstructionsText,
        available_outputs:
          availableOutputs.length > 0
            ? availableOutputs.map((output) => `- ${output}`).join('\n')
            : '- (No existing recipes found)',
      });

      const operationStartTime = new Date();
      const handlers: CodeChangesEventHandlers = {
        onProgress: (step) => {
          onProgress?.(step, false);
        },
        onThinkingStateChange: (isThinking) => {
          onProgress?.(null, isThinking);
        },
        onComplete: (_result, metadata) => {
          totalCostUsd = metadata?.costUsd || 0;
        },
        showChorenzoOperations: true,
        onError: (error) => {
          throw new RecipesError(
            formatErrorMessage('Magic generation failed', error),
            'MAGIC_GENERATION_FAILED'
          );
        },
      };

      const operationResult = await executeCodeChangesOperation(
        query({
          prompt: magicPrompt,
          options: {
            model: 'sonnet',
            allowedTools: ['Write'],
            permissionMode: 'bypassPermissions',
          },
        }),
        handlers,
        operationStartTime
      );

      if (!operationResult.success) {
        throw new RecipesError(
          operationResult.error || 'Magic generation failed',
          'MAGIC_GENERATION_FAILED'
        );
      }

      totalCostUsd = operationResult.metadata.costUsd;
    } else {
      const metadataTemplate = loadTemplate('recipe_metadata', 'yaml');
      const metadataContent = renderPrompt(metadataTemplate, templateVars);
      fs.writeFileSync(path.join(recipePath, 'metadata.yaml'), metadataContent);

      const promptTemplate = loadTemplate('recipe_prompt');
      const promptContent = renderPrompt(promptTemplate, templateVars);
      fs.writeFileSync(path.join(recipePath, 'prompt.md'), promptContent);

      const fixTemplate = loadTemplate('recipe_fix');
      const fixContent = renderPrompt(fixTemplate, templateVars);
      fs.writeFileSync(path.join(recipePath, 'fix.md'), fixContent);

      if (!options.ecosystemAgnostic) {
        const variantContent = renderPrompt(fixTemplate, templateVars);
        fs.writeFileSync(
          path.join(recipePath, 'variants', 'javascript_default.md'),
          variantContent
        );
      }
    }

    const endTime = new Date();
    const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;

    onProgress?.('Recipe generation complete!');

    return {
      recipePath,
      recipeName: recipeId,
      success: true,
      metadata: {
        costUsd: totalCostUsd,
        durationSeconds,
      },
    };
  } catch (error) {
    if (error instanceof RecipesError) {
      throw error;
    }
    throw new RecipesError(
      formatErrorMessage('Recipe generation failed', error),
      'GENERATION_FAILED'
    );
  }
}
