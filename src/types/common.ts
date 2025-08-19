export interface BaseMetadata {
  costUsd: number;
  turns: number;
  durationSeconds: number;
  subtype?: string;
}

export interface OperationMetadata extends BaseMetadata {
  startTime?: string;
  endTime?: string;
  type?: string;
  error?: string;
}

export interface BaseContainerOptions extends Record<string, unknown> {
  debug?: boolean;
  cost?: boolean;
}
