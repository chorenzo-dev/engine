export function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatErrorMessage(context: string, error: unknown): string {
  const message = extractErrorMessage(error);
  return `${context}: ${message}`;
}
