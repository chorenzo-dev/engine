import * as fs from 'fs';

import { formatErrorMessage } from './error.utils';

export class JsonError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'JsonError';
  }
}

export function readJson<T>(filePath: string): T {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(fileContent) as T;
    return data;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new JsonError(`File not found: ${filePath}`, 'FILE_NOT_FOUND');
    }
    if (error instanceof SyntaxError) {
      throw new JsonError(
        `Invalid JSON in file ${filePath}: ${error.message}`,
        'PARSE_ERROR'
      );
    }
    throw new JsonError(
      formatErrorMessage('Failed to read JSON file', error),
      'READ_ERROR'
    );
  }
}

export function writeJson<T>(filePath: string, data: T, pretty = true): void {
  try {
    const jsonContent = pretty
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);
    fs.writeFileSync(filePath, jsonContent, 'utf8');
  } catch (error) {
    throw new JsonError(
      formatErrorMessage('Failed to write JSON file', error),
      'WRITE_ERROR'
    );
  }
}
