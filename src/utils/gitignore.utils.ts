import * as fs from 'fs';
import * as path from 'path';

import { formatErrorMessage } from './error.utils';
import { Logger } from './logger.utils';

export class GitignoreManager {
  private static readonly CHORENZO_SECTION_START = '# Chorenzo';
  private static readonly CHORENZO_PATTERNS = [
    '/.chorenzo/*',
    '!/.chorenzo/state.json',
    '!/.chorenzo/analysis.json',
  ];

  static ensureChorenzoIgnorePatterns(projectRoot: string): void {
    const gitignorePath = path.join(projectRoot, '.gitignore');

    try {
      if (!fs.existsSync(gitignorePath)) {
        this.createGitignoreWithChorenzoPatterns(gitignorePath);
        return;
      }

      const content = fs.readFileSync(gitignorePath, 'utf-8');
      const updatedContent = this.updateChorenzoPatterns(content);

      if (updatedContent !== content) {
        fs.writeFileSync(gitignorePath, updatedContent, 'utf-8');
        Logger.info(
          {
            event: 'gitignore_updated',
            path: gitignorePath,
          },
          'Updated .gitignore with Chorenzo state file tracking'
        );
      }
    } catch (error) {
      Logger.warn(
        {
          event: 'gitignore_update_failed',
          path: gitignorePath,
          error: formatErrorMessage('gitignore update', error),
        },
        'Failed to update .gitignore for Chorenzo state files'
      );
    }
  }

  private static createGitignoreWithChorenzoPatterns(
    gitignorePath: string
  ): void {
    const content = this.generateChorenzoSection();
    fs.writeFileSync(gitignorePath, content, 'utf-8');

    Logger.info(
      {
        event: 'gitignore_created',
        path: gitignorePath,
      },
      'Created .gitignore with Chorenzo state file tracking'
    );
  }

  private static updateChorenzoPatterns(content: string): string {
    const hasChorenzoSection = content.includes(this.CHORENZO_SECTION_START);

    if (hasChorenzoSection) {
      return this.replaceChorenzoSection(content);
    }

    return this.appendChorenzoSection(content);
  }

  private static replaceChorenzoSection(content: string): string {
    const startIndex = content.indexOf(this.CHORENZO_SECTION_START);

    if (startIndex === -1) {
      return this.appendChorenzoSection(content);
    }

    const lines = content.split('\n');
    const startLineIndex = lines.findIndex((line) =>
      line.includes(this.CHORENZO_SECTION_START)
    );

    if (startLineIndex === -1) {
      return this.appendChorenzoSection(content);
    }

    let endLineIndex = startLineIndex + 1;
    while (endLineIndex < lines.length) {
      const line = lines[endLineIndex]?.trim();
      if (
        !line ||
        (!line.startsWith('/.chorenzo') && !line.startsWith('!/.chorenzo'))
      ) {
        break;
      }
      endLineIndex++;
    }

    const before = lines.slice(0, startLineIndex).join('\n');
    const after = lines.slice(endLineIndex).join('\n');
    const newSection = this.generateChorenzoSection();

    const beforeTrimmed = before.trim();
    const afterTrimmed = after.trim();
    const separator =
      beforeTrimmed && afterTrimmed ? '\n\n' : beforeTrimmed ? '\n' : '';

    return (
      beforeTrimmed +
      (beforeTrimmed ? '\n\n' : '') +
      newSection +
      separator +
      afterTrimmed
    );
  }

  private static appendChorenzoSection(content: string): string {
    const trimmedContent = content.trim();
    const separator = trimmedContent ? '\n\n' : '';
    return trimmedContent + separator + this.generateChorenzoSection();
  }

  private static generateChorenzoSection(): string {
    const patterns = this.CHORENZO_PATTERNS.join('\n');
    return `${this.CHORENZO_SECTION_START}\n${patterns}\n`;
  }

  static loadGitIgnorePatternsForDir(
    directory: string,
    parentPatterns: Set<string> = new Set()
  ): Set<string> {
    const patterns = new Set(parentPatterns);
    const gitignorePath = path.join(directory, '.gitignore');

    if (fs.existsSync(gitignorePath)) {
      try {
        const content = fs.readFileSync(gitignorePath, 'utf-8');
        const lines = content
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#'));

        for (const line of lines) {
          patterns.add(line);
        }
      } catch (error) {
        Logger.warn(
          {
            event: 'gitignore_read_failed',
            path: gitignorePath,
            error: formatErrorMessage('gitignore read', error),
          },
          'Failed to read .gitignore file'
        );
      }
    }

    return patterns;
  }

  static isIgnored(
    filePath: string,
    rootDir: string,
    ignorePatterns: Set<string>
  ): boolean {
    const relPath = path.relative(rootDir, filePath);
    const parts = relPath.split(path.sep);

    for (const pattern of ignorePatterns) {
      if (
        this.matchGitIgnorePattern(relPath, pattern) ||
        relPath.startsWith(pattern) ||
        parts.includes(pattern)
      ) {
        return true;
      }
    }

    return false;
  }

  private static matchGitIgnorePattern(
    filePath: string,
    pattern: string
  ): boolean {
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/\*\*/g, '.*');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath) || regex.test(path.basename(filePath));
  }
}
