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
  Python = 'python',
  Java = 'java',
  Dotnet = 'dotnet',
  Go = 'go',
  Rust = 'rust',
  Ruby = 'ruby',
  Php = 'php',
  Swift = 'swift',
  Dart = 'dart',
  Elixir = 'elixir',
  Haskell = 'haskell',
  Perl = 'perl',
  R = 'r',
  Julia = 'julia',
  Lua = 'lua',
  Unknown = 'unknown',
}

export enum Language {
  JavaScript = 'javascript',
  TypeScript = 'typescript',
  Python = 'python',
  Java = 'java',
  Scala = 'scala',
  Kotlin = 'kotlin',
  Groovy = 'groovy',
  CSharp = 'csharp',
  FSharp = 'fsharp',
  VBNet = 'vbnet',
  Go = 'go',
  Rust = 'rust',
  Ruby = 'ruby',
  Php = 'php',
  Swift = 'swift',
  ObjectiveC = 'objective-c',
  Dart = 'dart',
  Elixir = 'elixir',
  Haskell = 'haskell',
  Perl = 'perl',
  R = 'r',
  Julia = 'julia',
  Lua = 'lua',
  C = 'c',
  Cpp = 'cpp',
  Unknown = 'unknown',
}

export interface ProjectAnalysis {
  path: string;
  language: string;
  type: ProjectType;
  framework?: string | null;
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
