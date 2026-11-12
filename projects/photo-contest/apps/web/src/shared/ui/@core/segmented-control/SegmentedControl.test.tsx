import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { SegmentedControl, SegmentedControlItem } from './SegmentedControl';

type TColorMode = 'default' | 'light' | 'dark';

// 앱이 쓰는 공통 토큰. data-theme이 없으면 theme.css 값만, 있으면 color-schemes.css의 light-dark() 값을 쓴다.
const stylesDir = dirname(createRequire(import.meta.url).resolve('@side/design-system/theme.css'));
const readStyle = (file: string) => readFileSync(join(stylesDir, file), 'utf8');
const themeTokens = new Map(
  [...readStyle('theme.css').matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(
    ([, name = '', hex = '']) => [name, hex.toLowerCase()],
  ),
);
const schemeTokens = (mode: 'light' | 'dark') =>
  new Map(
    [
      ...readStyle('color-schemes.css').matchAll(
        /--color-([a-z0-9-]+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi,
      ),
    ].map(([, name = '', light = '', dark = '']) => [name, (mode === 'light' ? light : dark).toLowerCase()]),
  );

function resolveColor(token: string, mode: TColorMode) {
  const value = (mode === 'default' ? undefined : schemeTokens(mode).get(token)) ?? themeTokens.get(token);
  if (!value) throw new Error(`--color-${token} 토큰이 없습니다.`);
  return value;
}

function luminance(hex: string) {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG 2.x 대비. 소수 둘째 자리에서 내린다. */
function contrastRatio(first: string, second: string) {
  const [light = 0, dark = 0] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return Math.floor(((light + 0.05) / (dark + 0.05)) * 100) / 100;
}

/** 클래스 목록에서 `prefix` 뒤가 색 토큰인 첫 값(`text-label` 같은 글자 크기는 건너뛴다) */
function colorOf(element: HTMLElement, prefix: string) {
  return element.className
    .split(/\s+/)
    .map((name) => (name.startsWith(prefix) ? name.slice(prefix.length) : ''))
    .find((token) => themeTokens.has(token));
}

// 다크 모드에서 고른 칸의 바탕(surface/sunken 1.07:1)과 글자색(ink/muted 1.97:1)만으로는 고른 칸이 구분되지 않았다.
it.each<TColorMode>(['default', 'light', 'dark'])(
  '%s 모드에서 고른 칸은 고르지 않은 칸과 3:1 이상 구분돼야 한다(WCAG 1.4.11)',
  (mode) => {
    render(
      <SegmentedControl label="사진 정렬" value="latest" onValueChange={() => undefined}>
        <SegmentedControlItem value="latest">최신순</SegmentedControlItem>
        <SegmentedControlItem value="popular">좋아요순</SegmentedControlItem>
      </SegmentedControl>,
    );
    const group = screen.getByRole('group', { name: '사진 정렬' });
    const item = screen.getByRole('button', { name: '최신순' });
    const groupBackground = colorOf(group, 'bg-');
    const pairs = [
      [colorOf(item, 'data-pressed:text-'), colorOf(item, 'text-')],
      [colorOf(item, 'data-pressed:bg-'), groupBackground],
      [colorOf(item, 'data-pressed:border-'), groupBackground],
    ].filter((pair): pair is [string, string] => pair.every(Boolean));
    const ratios = pairs.map(([pressed, other]) =>
      contrastRatio(resolveColor(pressed, mode), resolveColor(other, mode)),
    );
    expect(Math.max(...ratios), pairs.join(' | ')).toBeGreaterThanOrEqual(3);
  },
);
