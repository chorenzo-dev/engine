export const icons = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  celebration: '🎉',
  arrow: '→',
  back: '←',
  dash: '-',
  bullet: '•',
} as const;

export type IconKey = keyof typeof icons;
export type IconValue = (typeof icons)[IconKey];
