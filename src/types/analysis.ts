export enum ProjectType {
  CliTool = 'cli_tool',
  WebApp = 'web_app',
  ApiServer = 'api_server',
  BackendService = 'backend_service',
  Library = 'library',
  Script = 'script',
  Infrastructure = 'infrastructure',
  DesktopApp = 'desktop_app',
  MobileApp = 'mobile_app',
  Unknown = 'unknown',
}

export enum CiCdSystem {
  GithubActions = 'github_actions',
  GitlabCi = 'gitlab_ci',
  Circleci = 'circleci',
  Jenkins = 'jenkins',
  TravisCi = 'travis_ci',
  AzureDevops = 'azure_devops',
  BitbucketPipelines = 'bitbucket_pipelines',
  Teamcity = 'teamcity',
  Bamboo = 'bamboo',
  Codeship = 'codeship',
  Drone = 'drone',
  Buildkite = 'buildkite',
  Semaphore = 'semaphore',
  Appveyor = 'appveyor',
  None = 'none',
}

export enum Ecosystem {
  Javascript = 'javascript',
  Typescript = 'typescript',
  Python = 'python',
  Java = 'java',
  Csharp = 'csharp',
  Go = 'go',
  Rust = 'rust',
  Ruby = 'ruby',
  Php = 'php',
  Swift = 'swift',
  Kotlin = 'kotlin',
  Dart = 'dart',
  Elixir = 'elixir',
  Scala = 'scala',
  Clojure = 'clojure',
  Haskell = 'haskell',
  C = 'c',
  Cpp = 'cpp',
  Unknown = 'unknown',
}

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
