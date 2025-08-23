import * as fs from 'fs';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

import { formatErrorMessage } from './error.utils';

export class YamlError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'YamlError';
  }
}

export function readYaml<T>(filePath: string): T {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const data = yamlParse(fileContent) as T;
    return data;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new YamlError(`File not found: ${filePath}`, 'FILE_NOT_FOUND');
    }
    throw new YamlError(
      formatErrorMessage('Failed to read YAML file', error),
      'READ_ERROR'
    );
  }
}

export function writeYaml<T>(filePath: string, data: T): void {
  try {
    const yamlContent = yamlStringify(data);
    fs.writeFileSync(filePath, yamlContent, 'utf8');
  } catch (error) {
    throw new YamlError(
      formatErrorMessage('Failed to write YAML file', error),
      'WRITE_ERROR'
    );
  }
}

export function parseYaml<T = unknown>(yamlContent: string): T {
  try {
    return yamlParse(yamlContent) as T;
  } catch (error) {
    throw new YamlError(
      formatErrorMessage('Failed to parse YAML', error),
      'PARSE_ERROR'
    );
  }
}
