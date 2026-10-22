import { describe, expect, it } from 'vitest';

import {
  colorModes,
  contrastRatio,
  parseHexTokens,
  readSchemeTokens,
  readStyle,
  resolveColor,
} from '../test/color-tokens';

const pageBackgrounds = ['canvas', 'surface', 'sunken', 'neutral-soft', 'brand-soft'];

describe('포커스 링 대비', () => {
  it('전역 :focus-visible 링은 focus-ring 토큰을 써야 한다', () => {
    expect(readStyle('base.css')).toMatch(
      /:focus-visible\s*{\s*outline:\s*3px solid var\(--color-focus-ring\)/,
    );
  });

  it.each(colorModes)('%s 모드에서 링이 바탕과 3:1 이상이어야 한다(WCAG 1.4.11)', (mode) => {
    const ring = resolveColor('focus-ring', mode);
    for (const background of pageBackgrounds) {
      expect
        .soft(contrastRatio(ring, resolveColor(background, mode)), `${background}`)
        .toBeGreaterThanOrEqual(3);
    }
  });

  it('다크 모드는 기존 accent 링을 유지해야 한다', () => {
    expect(resolveColor('focus-ring', 'dark')).toBe(resolveColor('accent', 'dark'));
  });
});

describe('글자 토큰 대비', () => {
  it.each(colorModes)('%s 모드에서 muted·danger 글자가 바탕과 4.5:1 이상이어야 한다', (mode) => {
    for (const text of ['muted', 'danger']) {
      for (const background of pageBackgrounds) {
        expect
          .soft(
            contrastRatio(resolveColor(text, mode), resolveColor(background, mode)),
            `${text} / ${background}`,
          )
          .toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('light-dark() 대체값', () => {
  const css = readStyle('color-schemes.css');
  const fallbackStart = css.indexOf('@supports not (color: light-dark(#000, #fff))');
  const fallback = fallbackStart < 0 ? '' : css.slice(fallbackStart);

  function fallbackTokens(selector: string) {
    const start = fallback.indexOf(`${selector} {`);
    if (start < 0) throw new Error(`${selector} 대체 블록이 없습니다.`);
    return parseHexTokens(fallback.slice(start, fallback.indexOf('}', start)));
  }

  it('미지원 브라우저용 hex 값은 light-dark()의 라이트·다크 인자와 같아야 한다', () => {
    expect(fallback).not.toBe('');
    expect(fallbackTokens(':root[data-theme]')).toEqual(readSchemeTokens('light'));
    expect(fallbackTokens(":root[data-theme='dark']")).toEqual(readSchemeTokens('dark'));
    expect(fallbackTokens(":root[data-theme]:not([data-theme='light'])")).toEqual(readSchemeTokens('dark'));
  });
});
