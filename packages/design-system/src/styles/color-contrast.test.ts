import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  colorModes,
  contrastRatio,
  parseHexTokens,
  readSchemeTokens,
  readStyle,
  resolveColor,
} from '../test/color-tokens';
import { sourceFiles, uiDir } from '../test/ui-sources';
import { inputControlClassName } from '../ui/input/input.styles';

const pageBackgrounds = ['canvas', 'surface', 'sunken', 'neutral-soft', 'brand-soft'];
// 메뉴·선택 항목은 강조 배경 위 안쪽에 포커스 링을 그린다.
const highlightBackgrounds = [
  ...new Set(
    sourceFiles(uiDir).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/data-highlighted:bg-([a-z-]+)/g)].map(([, token]) => token!),
    ),
  ),
];

describe('입력 경계 대비', () => {
  it.each(colorModes)('%s 모드에서 실제 입력 경계가 인접 바탕과 3:1 이상이어야 한다', (mode) => {
    const inputToken = inputControlClassName.match(/(?:^|\s)border-([a-z-]+)(?=\s|$)/)?.[1];
    const shadcnToken = readStyle('shadcn.css').match(
      /--color-input-border:\s*var\(--color-([a-z-]+)\)/,
    )?.[1];
    if (!inputToken || !shadcnToken) throw new Error('입력 경계 색 토큰을 찾을 수 없습니다.');
    for (const token of [inputToken, shadcnToken]) {
      for (const background of pageBackgrounds) {
        expect
          .soft(
            contrastRatio(resolveColor(token, mode), resolveColor(background, mode)),
            `${token} / ${background}`,
          )
          .toBeGreaterThanOrEqual(3);
      }
    }
  });
});

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

  // 강조 배경은 팝업 바탕(surface)과 약 1.1:1이라 키보드 위치는 링으로만 구분된다.
  it.each(colorModes)('%s 모드에서 메뉴·선택 항목의 강조 배경 위 링도 3:1 이상이어야 한다', (mode) => {
    if (!highlightBackgrounds.length) throw new Error('항목 강조 배경 토큰을 찾을 수 없습니다.');
    const ring = resolveColor('focus-ring', mode);
    for (const background of highlightBackgrounds) {
      expect
        .soft(contrastRatio(ring, resolveColor(background, mode)), `${background}`)
        .toBeGreaterThanOrEqual(3);
    }
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

// subtle(라이트 흰 바탕 2.52:1)은 aria-hidden 장식 아이콘에만 쓴다. 글자인 자리표시와 조작 요소의 표시는 아래 토큰이 맡는다.
describe('자리표시와 시트 손잡이 대비', () => {
  const sheetCss = readFileSync(join(uiDir, 'bottom-sheet/bottom-sheet.css'), 'utf8');

  it.each(colorModes)('%s 모드에서 자리표시 글자가 입력 바탕과 4.5:1 이상이어야 한다', (mode) => {
    const baseToken = readStyle('base.css').match(
      /::placeholder\s*{\s*color:\s*var\(--color-([a-z-]+)\)/,
    )?.[1];
    const inputToken = inputControlClassName.match(/(?:^|\s)placeholder:text-([a-z-]+)(?=\s|$)/)?.[1];
    if (!baseToken || !inputToken) throw new Error('자리표시 색 토큰을 찾을 수 없습니다.');
    for (const token of [baseToken, inputToken]) {
      for (const background of pageBackgrounds) {
        expect
          .soft(
            contrastRatio(resolveColor(token, mode), resolveColor(background, mode)),
            `${token} / ${background}`,
          )
          .toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  // 높이 조절 slider는 손잡이 막대 말고 다른 시각 경계가 없다.
  it.each(colorModes)('%s 모드에서 시트 손잡이가 시트 바탕과 3:1 이상이어야 한다(WCAG 1.4.11)', (mode) => {
    const grip = sheetCss.match(/\.ds-sheet-grip\s*{[^}]*background:\s*var\(--color-([a-z-]+)\)/)?.[1];
    const sheet = sheetCss.match(/\.ds-sheet-popup\s*{[^}]*background:\s*var\(--color-([a-z-]+)\)/)?.[1];
    if (!grip || !sheet) throw new Error('시트 손잡이·바탕 색 토큰을 찾을 수 없습니다.');
    expect(contrastRatio(resolveColor(grip, mode), resolveColor(sheet, mode))).toBeGreaterThanOrEqual(3);
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
