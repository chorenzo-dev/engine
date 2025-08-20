import fs from 'fs/promises';
import path from 'path';
import { ZodIssue } from 'zod';

import { WorkspaceAnalysisSchema } from '../schemas/analysis.schema';
import { JsonError, readJson } from './json.utils';
import { workspaceConfig } from './workspace-config.utils';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  data?: unknown;
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

export class AnalysisValidationError extends Error {
  constructor(
    message: string,
    public errors: ValidationError[]
  ) {
    super(message);
    this.name = 'AnalysisValidationError';
  }
}

export async function validateAnalysisFile(
  filePath: string
): Promise<ValidationResult> {
  try {
    const resolvedPath = path.resolve(filePath);

    try {
      await fs.access(resolvedPath);
    } catch {
      return {
        valid: false,
        errors: [
          {
            path: 'file',
            message: `Analysis file not found: ${filePath}`,
            code: 'FILE_NOT_FOUND',
          },
        ],
      };
    }

    let data: unknown;
    try {
      data = await readJson(resolvedPath);
    } catch (error) {
      if (error instanceof JsonError) {
        return {
          valid: false,
          errors: [
            {
              path: 'file',
              message: `Invalid JSON: ${error.message}`,
              code: 'INVALID_JSON',
            },
          ],
        };
      }
      throw error;
    }

    return validateAnalysisData(data);
  } catch (error) {
    return {
      valid: false,
      errors: [
        {
          path: 'file',
          message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
          code: 'UNEXPECTED_ERROR',
        },
      ],
    };
  }
}

export function validateAnalysisData(data: unknown): ValidationResult {
  try {
    const result = WorkspaceAnalysisSchema.safeParse(data);

    if (result.success) {
      return {
        valid: true,
        errors: [],
        data: result.data,
      };
    }

    const errors: ValidationError[] = result.error.issues.map(
      (issue: ZodIssue) => {
        let message = issue.message;

        // Improve error messages
        if (
          issue.code === 'invalid_type' &&
          issue.message.includes('received undefined')
        ) {
          message = 'is missing';
        } else if (issue.code === 'unrecognized_keys') {
          const keys = (issue as { keys?: string[] }).keys || [];
          message = `unexpected field${keys.length > 1 ? 's' : ''}: ${keys.join(', ')}`;
        }

        return {
          path: issue.path.join('.') || 'root',
          message,
          code: issue.code,
        };
      }
    );

    return {
      valid: false,
      errors,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [
        {
          path: 'root',
          message: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
          code: 'VALIDATION_ERROR',
        },
      ],
    };
  }
}

export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) {
    return 'No validation errors';
  }

  // Group errors by type
  const missingFields: string[] = [];
  const invalidValues: string[] = [];
  const unexpectedFields: string[] = [];

  errors.forEach((error) => {
    if (error.message === 'is missing') {
      missingFields.push(error.path);
    } else if (error.message.startsWith('unexpected field')) {
      const keys = error.message.match(/unexpected field[s]?: (.+)/)?.[1] || '';
      keys.split(', ').forEach((key: string) => {
        const fullPath = error.path === 'root' ? key : `${error.path}.${key}`;
        unexpectedFields.push(fullPath);
      });
    } else {
      // Other validation errors (invalid values, wrong types, etc.)
      invalidValues.push(`${error.path}: ${error.message}`);
    }
  });

  const lines: string[] = [
    `Found ${errors.length} validation error${errors.length === 1 ? '' : 's'}:`,
  ];

  let errorIndex = 1;

  if (missingFields.length > 0) {
    lines.push(
      `  ${errorIndex++}. Missing fields: ${missingFields.join(', ')}`
    );
  }

  if (invalidValues.length > 0) {
    invalidValues.forEach((error) => {
      lines.push(`  ${errorIndex++}. Invalid field value: ${error}`);
    });
  }

  if (unexpectedFields.length > 0) {
    lines.push(
      `  ${errorIndex++}. Unexpected fields: ${unexpectedFields.join(', ')}`
    );
  }

  return lines.join('\n');
}

export function getDefaultAnalysisPath(): string {
  return workspaceConfig.getAnalysisPath();
}
