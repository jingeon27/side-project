import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `default`는 data-theme이 없는 소비 앱, `light`·`dark`는 data-theme으로 모드를 정한 앱이다. */
export type TColorMode = 'default' | 'light' | 'dark';

// jsdom 환경의 URL은 node:fs가 받지 않으므로 경로 문자열로 바꾼다.
const stylesDir = join(dirname(fileURLToPath(import.meta.url)), '../styles');

export function readStyle(file: string) {
  return readFileSync(join(stylesDir, file), 'utf8');
}

export function parseHexTokens(css: string) {
  return Object.fromEntries(
    [...css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(([, name, value]) => [
      name,
      value!.toLowerCase(),
    ]),
  ) as Record<string, string>;
}

/** theme.css의 기본 토큰. data-theme이 없으면 이 값만 쓴다. */
export function readThemeTokens() {
  return parseHexTokens(readStyle('theme.css'));
}

/** color-schemes.css의 `light-dark(라이트, 다크)` 토큰을 모드별로 나눈다. */
export function readSchemeTokens(mode: 'light' | 'dark') {
  const css = readStyle('color-schemes.css');
  return Object.fromEntries(
    [...css.matchAll(/--color-([a-z0-9-]+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi)].map(
      ([, name, light, dark]) => [name, (mode === 'light' ? light : dark)!.toLowerCase()],
    ),
  ) as Record<string, string>;
}

export function resolveColor(token: string, mode: TColorMode) {
  const value = (mode === 'default' ? {} : readSchemeTokens(mode))[token] ?? readThemeTokens()[token];
  if (!value) throw new Error(`--color-${token} 토큰이 없습니다.`);
  return value;
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

/** WCAG 2.x 대비. 소수 둘째 자리에서 내린다(4.499는 4.49로 미달). */
export function contrastRatio(foreground: string, background: string) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return Math.floor(((light! + 0.05) / (dark! + 0.05)) * 100) / 100;
}

export const colorModes: TColorMode[] = ['default', 'light', 'dark'];
