import fs from 'fs/promises';
import path from 'path';
import { loadGitIgnorePatternsForDir, isIgnored } from './validation.js';

const lockFiles = new Set([
  'package-lock.json',
  'uv.lock',
  'poetry.lock',
  'Pipfile.lock',
  'yarn.lock',
  'pnpm-lock.yaml',
  'shrinkwrap.yaml',
]);

interface TreeNode {
  [key: string]: TreeNode | string[];
}

export async function buildFileTree(
  rootDir: string,
  subdir?: string,
  numLevels?: number
): Promise<string> {
  const seen = new Set<string>();

  async function buildTree(
    currentPath: string,
    parentPatterns: Set<string>,
    level = 0
  ): Promise<TreeNode | string[] | null> {
    if (numLevels !== undefined && level >= numLevels) {
      return null;
    }

    const absPath = path.resolve(currentPath);
    if (seen.has(absPath)) {
      return null;
    }
    seen.add(absPath);

    const patterns = loadGitIgnorePatternsForDir(currentPath, parentPatterns);
    if (isIgnored(currentPath, rootDir, patterns)) {
      return null;
    }

    const stats = await fs.stat(absPath);
    
    if (stats.isDirectory()) {
      const baseName = path.basename(absPath);
      
      if (baseName === '.git') {
        return null;
      }

      const children: TreeNode = {};
      const files: string[] = [];

      const entries = await fs.readdir(absPath);
      const sortedEntries = entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

      for (const entry of sortedEntries) {
        if (lockFiles.has(entry)) {
          continue;
        }

        const childPath = path.join(absPath, entry);
        const childStats = await fs.stat(childPath);

        if (childStats.isDirectory()) {
          const subtree = await buildTree(childPath, patterns, level + 1);
          if (subtree !== null) {
            children[entry] = subtree as TreeNode;
          }
        } else if (childStats.isFile()) {
          if (!isIgnored(childPath, rootDir, patterns)) {
            files.push(entry);
          }
        }
      }

      if (Object.keys(children).length > 0 && files.length > 0) {
        return { ...children, __files__: files };
      } else if (Object.keys(children).length > 0) {
        return children;
      } else if (files.length > 0) {
        return files;
      } else {
        return null;
      }
    }

    return null;
  }

  const tree = await buildTree(rootDir, new Set(), 0);

  function toYamlStyle(name: string, node: TreeNode | string[] | null, indent = 0): string[] {
    const pad = '  '.repeat(indent);
    
    if (node === null) {
      return [`${pad}${name}: (empty)`];
    }

    if (Array.isArray(node)) {
      const lines = [`${pad}${name}:`];
      for (const file of node) {
        lines.push(`${pad}  - ${file}`);
      }
      return lines;
    }

    const lines = [`${pad}${name}:`];
    for (const [key, value] of Object.entries(node)) {
      if (key === '__files__' && Array.isArray(value)) {
        for (const file of value) {
          lines.push(`${pad}  - ${file}`);
        }
      } else {
        lines.push(...toYamlStyle(key, value as TreeNode | string[], indent + 1));
      }
    }
    return lines;
  }

  if (subdir) {
    const subdirPath = path.join(rootDir, subdir);
    try {
      await fs.access(subdirPath);
      const subtree = await buildTree(subdirPath, new Set(), 0);
      return toYamlStyle(path.basename(subdir), subtree).join('\n');
    } catch {
      return `${subdir}: (not found)`;
    }
  }

  const rootName = path.basename(path.resolve(rootDir)) || 'root';
  return toYamlStyle(rootName, tree).join('\n');
}