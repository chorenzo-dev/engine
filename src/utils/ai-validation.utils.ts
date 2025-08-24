import { query } from '@anthropic-ai/claude-code';

import {
  CodeSampleValidationResult,
  CodeSampleViolationType,
  FileToValidate,
  Recipe,
} from '~/types/recipe';
import {
  CodeChangesEventHandlers,
  executeCodeChangesOperation,
} from '~/utils/code-changes-events.utils';
import { loadTemplate, renderPrompt } from '~/utils/prompts.utils';

import { extractErrorMessage } from './error.utils';

const RECIPE_FIX_FILE_TYPE = 'markdown';
const DEFAULT_AI_MODEL = 'sonnet';

export class CodeSampleValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'CodeSampleValidationError';
  }
}

export async function performCodeSampleValidation(
  recipe: Recipe
): Promise<CodeSampleValidationResult> {
  try {
    const filesToValidate: FileToValidate[] = [];

    for (const [filePath, content] of recipe.fixFiles.entries()) {
      filesToValidate.push({
        path: filePath,
        content,
        language: RECIPE_FIX_FILE_TYPE,
      });
    }

    if (filesToValidate.length === 0) {
      return {
        valid: true,
        violations: [],
        summary: {
          totalFiles: 0,
          filesWithViolations: 0,
          totalViolations: 0,
          violationTypes: {
            generic_placeholder: 0,
            incomplete_fragment: 0,
            abstract_pseudocode: 0,
            overly_simplistic: 0,
          },
        },
      };
    }

    const validationResult = await validateRecipeFixContent(filesToValidate);
    return validationResult;
  } catch (error) {
    throw new CodeSampleValidationError(
      `Code sample validation failed: ${extractErrorMessage(error)}`,
      'VALIDATION_FAILED'
    );
  }
}

async function validateRecipeFixContent(
  files: FileToValidate[]
): Promise<CodeSampleValidationResult> {
  try {
    const template = loadTemplate('validation/code_sample_validation');
    const prompt = renderPrompt(template, {
      files: files.map((file) => ({
        path: file.path,
        content: file.content,
        language: RECIPE_FIX_FILE_TYPE,
      })),
    });

    let responseText = '';

    const handlers: CodeChangesEventHandlers = {
      onProgress: () => {},
      onThinkingStateChange: () => {},
      onComplete: () => {},
      onError: (error) => {
        throw new CodeSampleValidationError(
          `AI validation failed: ${extractErrorMessage(error)}`,
          'AI_VALIDATION_FAILED'
        );
      },
    };

    const operationStartTime = new Date();
    const operationResult = await executeCodeChangesOperation(
      query({
        prompt,
        options: {
          model: DEFAULT_AI_MODEL,
          allowedTools: [],
          permissionMode: 'bypassPermissions',
        },
      }),
      handlers,
      operationStartTime
    );

    if (!operationResult.success) {
      throw new CodeSampleValidationError(
        operationResult.error || 'AI validation failed',
        'AI_VALIDATION_FAILED'
      );
    }

    responseText = String(operationResult.result || '');
    const validationResult = parseFixContentValidationResponse(responseText);

    return validationResult;
  } catch (error) {
    throw new CodeSampleValidationError(
      `AI validation failed: ${extractErrorMessage(error)}`,
      'AI_VALIDATION_FAILED'
    );
  }
}

function parseFixContentValidationResponse(
  response: string
): CodeSampleValidationResult {
  try {
    let jsonString: string;

    const codeBlockMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch?.[1]) {
      jsonString = codeBlockMatch[1];
    } else {
      const objectMatch = response.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        jsonString = objectMatch[0];
      } else {
        jsonString = response.trim();
      }
    }

    const parsed = JSON.parse(jsonString);

    if (!isValidFixContentValidationResponse(parsed)) {
      throw new Error('Invalid response structure');
    }

    return parsed;
  } catch (error) {
    throw new CodeSampleValidationError(
      `Failed to parse AI validation response: ${extractErrorMessage(error)}`,
      'RESPONSE_PARSE_FAILED'
    );
  }
}

function isValidFixContentValidationResponse(
  obj: unknown
): obj is CodeSampleValidationResult {
  const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object';

  if (!isObject(obj)) {
    return false;
  }

  if (typeof obj['valid'] !== 'boolean') {
    return false;
  }

  if (!Array.isArray(obj['violations'])) {
    return false;
  }

  if (!isObject(obj['summary'])) {
    return false;
  }

  const summary = obj['summary'];
  const requiredSummaryFields = [
    'totalFiles',
    'filesWithViolations',
    'totalViolations',
    'violationTypes',
  ] as const;
  if (!requiredSummaryFields.every((field) => field in summary)) {
    return false;
  }

  const validTypes: Set<CodeSampleViolationType> = new Set([
    'generic_placeholder',
    'incomplete_fragment',
    'abstract_pseudocode',
    'overly_simplistic',
  ]);

  for (const violation of obj['violations']) {
    if (!isObject(violation)) {
      return false;
    }

    const requiredViolationFields = [
      'file',
      'line',
      'type',
      'description',
      'suggestion',
      'codeSnippet',
    ] as const;
    if (!requiredViolationFields.every((field) => field in violation)) {
      return false;
    }

    if (
      typeof violation['type'] !== 'string' ||
      !validTypes.has(violation['type'] as CodeSampleViolationType)
    ) {
      return false;
    }
  }

  return true;
}
