export interface OperationMetadata {
  durationSeconds: number;
  costUsd: number;
  startTime?: string;
  endTime?: string;
  type?: string;
  subtype?: string;
  turns?: number;
  error?: string;
}
