import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { pixels, readFocusRing } from '../test/tailwind-theme';
import { sourceFiles, uiDir } from '../test/ui-sources';

// base.css의 `:focus-visible` outline(focus-ring 토큰, color-contrast.test.ts)이 유일한 포커스 표시다.
// `outline-none`은 utilities 레이어라 이 outline을 지우고, box-shadow 링은 forced-colors에서 사라진다.
const hiddenOutline = /(?<![\w-])(?:[\w-]+:)*outline-none(?![\w-])/g;
const focusOverride = /(?<![\w-])(?:[\w-]+:)*focus(?:-visible)?:(?:ring|outline)[\w-[\]/().]*/g;
const hiddenOutlineStyle = /(?<![\w-])(?:[\w-]+:)*outline-hidden(?![\w-])/g;
// outline-hidden도 링을 지우고 forced-colors에서만 투명 outline을 남긴다. 포커스를 받는 팝업 컨테이너에만 쓴다.
// 메뉴·선택 항목처럼 실제 포커스가 옮겨 가는 요소에 쓰면 현재 위치가 약 1.1:1의 강조 배경으로만 남는다.
const popupContainerOutlines = [
  'dialog/dialog.styles.ts', // Dialog popup
  'dropdown-menu/DropdownMenu.tsx', // Menu Positioner
  'dropdown-menu/DropdownMenu.tsx', // Menu Popup
];

function findAll(pattern: RegExp, files: string[]) {
  return files.flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(pattern)].map(([match]) => `${relative(uiDir, file)}: ${match}`),
  );
}

describe('키보드 포커스 표시', () => {
  const classFiles = sourceFiles(uiDir);

  it('ui 클래스 문자열은 outline-none으로 전역 포커스 링을 지우지 않아야 한다', () => {
    expect(classFiles.length).toBeGreaterThan(10);
    expect(findAll(hiddenOutline, classFiles)).toEqual([]);
  });

  it('ui 클래스 문자열은 focus 링을 ring·outline 유틸리티로 바꾸지 않아야 한다', () => {
    expect(findAll(focusOverride, classFiles)).toEqual([]);
  });

  it('outline-hidden은 포커스를 받는 팝업 컨테이너에만 써야 한다', () => {
    const files = findAll(hiddenOutlineStyle, classFiles).map((match) => match.slice(0, match.indexOf(':')));
    expect(files.sort()).toEqual(popupContainerOutlines);
  });

  it('ui CSS는 outline: none 대신 forced-colors에서 보이는 outline-style만 끈다', () => {
    expect(findAll(/outline:\s*none/g, sourceFiles(uiDir, /\.css$/))).toEqual([]);
  });
});

// 시트 본문은 overflow-y: auto라 안쪽 여백 밖을 자르고, overflow-x도 auto로 계산돼 좌우도 자른다.
// 사진 선택이나 첫 버튼처럼 맨 위에 놓인 포커스 대상의 링이 잘렸다.
describe('바텀시트 본문 가장자리 포커스 링', () => {
  const sheetCss = readFileSync(join(uiDir, 'bottom-sheet/bottom-sheet.css'), 'utf8');

  /** 줄 첫머리에 단독 선택자로 쓴 규칙의 padding 단축 속성을 네 변의 값(px)으로 펼친다. */
  function paddingOf(selector: string) {
    const block = sheetCss.match(
      new RegExp(`^\\s*${selector.replaceAll('.', '\\.')}\\s*{([^}]*)}`, 'm'),
    )?.[1];
    const value = block?.match(/^\s*padding:\s*([^;]+);/m)?.[1];
    if (!value) throw new Error(`${selector}의 padding을 찾을 수 없습니다.`);
    // max(24px, env(...))처럼 괄호 안의 공백에서는 나누지 않는다. 빠진 변은 CSS 단축 속성처럼 맞은편 값을 쓴다.
    const [top = '', right = top, bottom = top, left = right] =
      value.match(/[^\s(]+(?:\((?:[^()]|\([^()]*\))*\))?/g) ?? [];
    return { top: pixels(top), right: pixels(right), bottom: pixels(bottom), left: pixels(left) };
  }

  it('본문 위쪽 여백은 링 두께와 바깥 간격을 모두 담아야 한다', () => {
    const ring = readFocusRing();
    expect(paddingOf('.ds-sheet-body').top).toBeGreaterThanOrEqual(ring.width + ring.offset);
  });

  it('본문 좌우 기본 여백도 링 두께와 바깥 간격을 모두 담아야 한다', () => {
    const ring = readFocusRing();
    const { left, right } = paddingOf('.ds-sheet-body');
    expect(Math.min(left, right)).toBeGreaterThanOrEqual(ring.width + ring.offset);
  });

  it('제목과 본문 사이 간격은 그대로 20px이어야 한다', () => {
    expect(paddingOf('.ds-sheet-header').bottom + paddingOf('.ds-sheet-body').top).toBe(20);
  });
});
