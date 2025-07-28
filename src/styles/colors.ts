export const colors = {
  success: 'green',
  error: 'red',
  warning: 'yellow',
  info: 'blue',
  progress: 'cyan',
  muted: 'gray',
  secondary: 'magenta',
  default: undefined,
} as const;

export type ColorKey = keyof typeof colors;
export type ColorValue = (typeof colors)[ColorKey];
