export type ProjectType = 'cli_tool' | 'web_app' | 'api_server' | 'backend_service' | 'library' | 'script' | 'infrastructure' | 'desktop_app' | 'mobile_app' | 'unknown';

export type CiCdSystem = 'github_actions' | 'gitlab_ci' | 'circleci' | 'jenkins' | 'travis_ci' | 'azure_devops' | 'bitbucket_pipelines' | 'teamcity' | 'bamboo' | 'codeship' | 'drone' | 'buildkite' | 'semaphore' | 'appveyor' | 'none';

export interface ProjectAnalysis {
  path: string;
  language: string;
  type: ProjectType;
  framework?: string;
  dependencies: string[];
  hasPackageManager: boolean;
  ecosystem?: string;
  dockerized?: boolean;
  ciCd?: CiCdSystem;
}

export interface WorkspaceAnalysis {
  isMonorepo: boolean;
  hasWorkspacePackageManager: boolean;
  workspaceEcosystem?: string;
  workspaceDependencies?: string[];
  projects: ProjectAnalysis[];
}