export type ProjectType = 'cli_tool' | 'web_app' | 'api_server' | 'backend_service' | 'library' | 'script' | 'infrastructure' | 'desktop_app' | 'mobile_app' | 'unknown';

export interface ProjectAnalysis {
  path: string;
  language: string;
  type: ProjectType;
  framework?: string;
  dependencies: string[];
  hasPackageManager: boolean;
  ecosystem?: string;
}

export interface WorkspaceAnalysis {
  isMonorepo: boolean;
  hasWorkspacePackageManager: boolean;
  workspaceEcosystem?: string;
  workspaceDependencies?: string[];
  projects: ProjectAnalysis[];
}