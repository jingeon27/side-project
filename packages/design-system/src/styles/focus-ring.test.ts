import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { sourceFiles, uiDir } from '../test/ui-sources';

// base.css의 `:focus-visible` outline(focus-ring 토큰, color-contrast.test.ts)이 유일한 포커스 표시다.
// `outline-none`은 utilities 레이어라 이 outline을 지우고, box-shadow 링은 forced-colors에서 사라진다.
const hiddenOutline = /(?<![\w-])(?:[\w-]+:)*outline-none(?![\w-])/g;
const focusOverride = /(?<![\w-])(?:[\w-]+:)*focus(?:-visible)?:(?:ring|outline)[\w-[\]/().]*/g;

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

  it('ui CSS는 outline: none 대신 forced-colors에서 보이는 outline-style만 끈다', () => {
    expect(findAll(/outline:\s*none/g, sourceFiles(uiDir, /\.css$/))).toEqual([]);
  });
});
