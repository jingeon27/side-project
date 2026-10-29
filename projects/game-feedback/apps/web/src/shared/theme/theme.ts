export const THEME_COOKIE = 'gf_theme';
export type TThemePreference = 'system' | 'light' | 'dark';

export function themePreference(value: unknown): TThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}
