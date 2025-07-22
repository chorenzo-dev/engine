export type ProjectType =
  | 'cli_tool'
  | 'web_app'
  | 'api_server'
  | 'backend_service'
  | 'library'
  | 'script'
  | 'infrastructure'
  | 'desktop_app'
  | 'mobile_app'
  | 'unknown';

export type CiCdSystem =
  | 'github_actions'
  | 'gitlab_ci'
  | 'circleci'
  | 'jenkins'
  | 'travis_ci'
  | 'azure_devops'
  | 'bitbucket_pipelines'
  | 'teamcity'
  | 'bamboo'
  | 'codeship'
  | 'drone'
  | 'buildkite'
  | 'semaphore'
  | 'appveyor'
  | 'none';

export type Ecosystem =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'java'
  | 'csharp'
  | 'go'
  | 'rust'
  | 'ruby'
  | 'php'
  | 'swift'
  | 'kotlin'
  | 'dart'
  | 'elixir'
  | 'scala'
  | 'clojure'
  | 'haskell'
  | 'c'
  | 'cpp'
  | 'unknown';

export interface ProjectAnalysis {
  path: string;
  language: string;
  type: ProjectType;
  framework?: string;
  dependencies: string[];
  hasPackageManager: boolean;
  ecosystem?: Ecosystem;
  dockerized?: boolean;
}

export interface WorkspaceAnalysis {
  isMonorepo: boolean;
  hasWorkspacePackageManager: boolean;
  workspaceEcosystem?: Ecosystem;
  workspaceDependencies?: string[];
  projects: ProjectAnalysis[];
  ciCd?: CiCdSystem;
}
