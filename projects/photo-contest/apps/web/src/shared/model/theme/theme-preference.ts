export const THEME_COOKIE = 'pc_theme';
export type TThemePreference = 'system' | 'light' | 'dark';

export function parseThemePreference(value: string | undefined): TThemePreference {
  if (value === 'light' || value === 'dark') return value;
  return 'system';
}
