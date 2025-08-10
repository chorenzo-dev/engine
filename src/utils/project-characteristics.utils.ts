import * as fs from 'fs';
import * as path from 'path';

import { ProjectAnalysis, WorkspaceAnalysis } from '~/types/analysis';

const ANALYSIS_PATH = path.join(process.cwd(), '.chorenzo', 'analysis.json');

export function isReservedKeyword(key: string): boolean {
  return (
    key.startsWith('workspace.') ||
    key.startsWith('project.') ||
    key.endsWith('.applied')
  );
}

export function isWorkspaceKeyword(key: string): boolean {
  return key.startsWith('workspace.');
}

export function isProjectKeyword(key: string): boolean {
  return key.startsWith('project.');
}

export async function loadWorkspaceAnalysis(): Promise<WorkspaceAnalysis | null> {
  try {
    if (!fs.existsSync(ANALYSIS_PATH)) {
      return null;
    }
    const content = fs.readFileSync(ANALYSIS_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function getWorkspaceCharacteristic(
  analysis: WorkspaceAnalysis,
  key: string
): string | undefined {
  const characteristic = key.replace('workspace.', '');

  switch (characteristic) {
    case 'is_monorepo':
      return String(analysis.isMonorepo);
    case 'has_workspace_package_manager':
      return String(analysis.hasWorkspacePackageManager);
    case 'ecosystem':
      return analysis.workspaceEcosystem;
    case 'cicd':
      return analysis.ciCd;
    default:
      return undefined;
  }
}

export function getProjectCharacteristic(
  project: ProjectAnalysis,
  key: string
): string | undefined {
  const characteristic = key.replace('project.', '');

  switch (characteristic) {
    case 'language':
      return project.language;
    case 'type':
      return project.type;
    case 'framework':
      return project.framework;
    case 'ecosystem':
      return project.ecosystem;
    case 'has_package_manager':
      return String(project.hasPackageManager);
    case 'dockerized':
      return String(project.dockerized || false);
    default:
      return undefined;
  }
}

export function findProjectByPath(
  analysis: WorkspaceAnalysis,
  projectPath: string
): ProjectAnalysis | undefined {
  return analysis.projects.find((p) => p.path === projectPath);
}
