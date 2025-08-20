import {
  formatValidationErrors,
  getDefaultAnalysisPath,
  validateAnalysisFile,
} from '../utils/analyze.utils';
import { Logger } from '../utils/logger.utils';

export interface AnalysisValidateOptions {
  file?: string;
  debug?: boolean;
}

export async function analysisValidate(
  options: AnalysisValidateOptions,
  onProgress?: (message: string) => void
): Promise<void> {
  const filePath = options.file || getDefaultAnalysisPath();

  Logger.info(`Starting validation process for: ${filePath}`);

  onProgress?.(`Checking if analysis file exists`);
  if (options.debug) {
    onProgress?.(`Looking for analysis file at: ${filePath}`);
  }

  onProgress?.(`Reading analysis file`);
  if (options.debug) {
    onProgress?.(`Reading and parsing JSON from: ${filePath}`);
  }

  onProgress?.(`Validating file structure`);
  if (options.debug) {
    onProgress?.(`Running Zod schema validation`);
  }

  const result = await validateAnalysisFile(filePath);

  if (result.valid) {
    onProgress?.('✅ Analysis file is valid');
    Logger.info('Schema validation passed successfully');
    if (options.debug) {
      onProgress?.(
        `Validated ${Object.keys(result.data || {}).length} top-level fields`
      );
      if (
        result.data &&
        typeof result.data === 'object' &&
        'projects' in result.data
      ) {
        const projects = (result.data as { projects: unknown }).projects;
        if (Array.isArray(projects)) {
          onProgress?.(
            `Found ${projects.length} project${projects.length === 1 ? '' : 's'} in analysis`
          );
        }
      }
    }
  } else {
    onProgress?.(`❌ Validation failed`);
    const errorMessage = formatValidationErrors(result.errors);
    onProgress?.(errorMessage);

    Logger.error(
      `Schema validation failed with ${result.errors.length} error${result.errors.length === 1 ? '' : 's'}`
    );
    if (options.debug) {
      onProgress?.(`Detailed error breakdown:`);
      result.errors.forEach((error, index) => {
        onProgress?.(
          `Error ${index + 1}: ${error.path} - ${error.message} (${error.code})`
        );
      });
      onProgress?.(`Validation process completed with errors`);
    }

    throw new Error(errorMessage);
  }
}
