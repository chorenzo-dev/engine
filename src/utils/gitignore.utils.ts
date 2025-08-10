import * as fs from 'fs';
import * as path from 'path';

import { Logger } from './logger.utils';

export class GitignoreManager {
  private static readonly CHORENZO_SECTION_START = '# Chorenzo';
  private static readonly CHORENZO_SECTION_END = '# End Chorenzo';
  private static readonly CHORENZO_PATTERNS = [
    '/.chorenzo/',
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
          error: error instanceof Error ? error.message : String(error),
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
    const hasOldChorenzoPattern = content.includes('/.chorenzo/');
    const hasChorenzoSection = content.includes(this.CHORENZO_SECTION_START);

    if (hasChorenzoSection) {
      return this.replaceChorenzoSection(content);
    }

    if (hasOldChorenzoPattern) {
      return this.replaceOldChorenzoPattern(content);
    }

    return this.appendChorenzoSection(content);
  }

  private static replaceChorenzoSection(content: string): string {
    const startIndex = content.indexOf(this.CHORENZO_SECTION_START);
    const endIndex = content.indexOf(this.CHORENZO_SECTION_END);

    if (startIndex === -1 || endIndex === -1) {
      return this.appendChorenzoSection(content);
    }

    const before = content.substring(0, startIndex);
    const after = content.substring(
      endIndex + this.CHORENZO_SECTION_END.length
    );
    const newSection = this.generateChorenzoSection();

    return before + newSection + after;
  }

  private static replaceOldChorenzoPattern(content: string): string {
    const lines = content.split('\n');
    const updatedLines = lines.map((line) => {
      if (line.trim() === '/.chorenzo/') {
        return '';
      }
      return line;
    });

    const cleanedContent = updatedLines.join('\n').replace(/\n\n+/g, '\n\n');
    return this.appendChorenzoSection(cleanedContent);
  }

  private static appendChorenzoSection(content: string): string {
    const trimmedContent = content.trim();
    const separator = trimmedContent ? '\n\n' : '';
    return trimmedContent + separator + this.generateChorenzoSection();
  }

  private static generateChorenzoSection(): string {
    const patterns = this.CHORENZO_PATTERNS.join('\n');
    return `${this.CHORENZO_SECTION_START}\n${patterns}\n${this.CHORENZO_SECTION_END}\n`;
  }
}
