export interface ProjectState {
  [key: string]: unknown;
}

export interface WorkspaceState {
  workspace?: Record<string, unknown>;
  projects?: Record<string, ProjectState>;
}
