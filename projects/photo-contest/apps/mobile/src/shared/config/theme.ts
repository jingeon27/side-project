/** 웹 theme.css 토큰과 같은 값이어야 스플래시·로딩 화면이 웹 첫 화면과 이어져 보인다. */
export const COLORS = {
  background: '#ffffff',
  brand: '#101010',
  brandPressed: '#363636',
  ink: '#101010',
  muted: '#6b6b6b',
  surface: '#ffffff',
} as const;

export const DARK_COLORS = {
  background: '#141312',
  brand: '#f4f1eb',
  brandPressed: '#d7d1c8',
  ink: '#f4f1eb',
  muted: '#b4ada3',
  surface: '#1c1b1a',
} as const;

export type TNativeColors = { [Key in keyof typeof COLORS]: string };
