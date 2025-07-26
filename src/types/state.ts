export interface ProjectState {
  [key: string]: unknown;
}

export interface WorkspaceState {
  [key: string]: unknown;
  projects?: Record<string, ProjectState>;
}
