export interface ProjectAnalysis {
  path: string;
  language: string;
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