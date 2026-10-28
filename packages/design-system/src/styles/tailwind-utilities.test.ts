import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

import { __unstable__loadDesignSystem as loadDesignSystem } from 'tailwindcss';
import { describe, expect, it } from 'vitest';

import { sourceFiles, srcDir, uiDir } from '../test/ui-sources';

const tailwindDir = dirname(createRequire(import.meta.url).resolve('tailwindcss/package.json'));

// 클래스 문자열로 보이는 리터럴(공백으로 나뉜 유틸리티 3개 이상)만 고른다. CSS 값(`min(360px, ...)`)은 괄호가 맞지 않아 빠진다.
const utilityPattern = /^!?-?[a-z*[][a-z0-9\-:[\]()=/.%,'*&>_@#!]*$/;
const count = (token: string, char: string) => token.split(char).length - 1;
const utilityToken = {
  test: (token: string) =>
    utilityPattern.test(token) &&
    count(token, '(') === count(token, ')') &&
    count(token, '[') === count(token, ']'),
};
// CSS를 만들지 않는 표식 클래스와 패키지 CSS가 직접 정의한 클래스
const markerClass = /^(group|peer)(\/[\w-]+)?$|^ds-|^toaster$/;

function classCandidates(source: string) {
  return [...source.matchAll(/(['"`])((?:(?!\1)[^\n\\])*)\1/g)]
    .map(([, , value]) => value!.trim().split(/\s+/))
    .filter((tokens) => tokens.length >= 3 && tokens.every((token) => utilityToken.test(token)))
    .flat()
    .filter((token) => !markerClass.test(token));
}

function loadTheme() {
  return loadDesignSystem(`@import 'tailwindcss';\n@import './styles.css';`, {
    base: srcDir,
    async loadStylesheet(id: string, base: string) {
      const path =
        id === 'tailwindcss'
          ? join(tailwindDir, 'index.css')
          : id.startsWith('tailwindcss/')
            ? join(tailwindDir, id.slice('tailwindcss/'.length))
            : resolve(base, id);
      return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
    },
  });
}

describe('Tailwind 유틸리티', () => {
  it('ui 컴포넌트의 클래스는 모두 패키지 테마에서 생성되어야 한다', async () => {
    const candidates = [
      ...new Set(sourceFiles(uiDir).flatMap((file) => classCandidates(readFileSync(file, 'utf8')))),
    ].sort();
    expect(candidates.length).toBeGreaterThan(100);
    const theme = await loadTheme();
    const css = theme.candidatesToCss(candidates);
    expect(candidates.filter((_, index) => !css[index])).toEqual([]);
  });

  it('dark: 변형은 OS 설정이 아니라 data-theme을 따라야 한다', async () => {
    const [css] = (await loadTheme()).candidatesToCss(['dark:bg-ink']);
    expect(css).toContain("[data-theme='dark']");
    expect(css).toMatch(/prefers-color-scheme: dark\)\s*{\s*[^{]*\[data-theme\]:not\(\[data-theme='light'\]/);
  });
});
