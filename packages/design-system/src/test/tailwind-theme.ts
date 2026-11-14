import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

import { __unstable__loadDesignSystem as loadDesignSystem } from 'tailwindcss';

import { readStyle } from './color-tokens';
import { srcDir } from './ui-sources';

const tailwindDir = dirname(createRequire(import.meta.url).resolve('tailwindcss/package.json'));

/** 소비 앱과 같은 진입점(tailwindcss + 패키지 styles.css)으로 테마를 읽어 클래스가 만드는 CSS를 확인한다. */
export function loadTheme() {
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

/** `0`·`-3px`·`calc(3px * -1)`을 px 숫자로 바꾼다. 다른 모양은 NaN이라 비교가 실패한다. */
export function pixels(value: string) {
  if (value === '0') return 0;
  const negated = value.match(/^calc\(([\d.]+)px \* -1\)$/)?.[1];
  if (negated) return -Number(negated);
  return /^-?[\d.]+px$/.test(value) ? Number.parseFloat(value) : Number.NaN;
}

/** base.css의 전역 :focus-visible 링. `width`는 두께, `offset`은 테두리 밖 간격(px)이다. */
export function readFocusRing() {
  const ring = readStyle('base.css').match(
    /:focus-visible\s*{\s*outline:\s*([\d.]+)px[^;]*;\s*outline-offset:\s*([^;]+);/,
  );
  if (!ring) throw new Error('base.css의 :focus-visible 링을 찾을 수 없습니다.');
  return { width: Number(ring[1]), offset: pixels(ring[2]!.trim()) };
}

/**
 * 요소의 클래스가 base.css의 전역 :focus-visible 링을 어떻게 바꾸는지 생성 CSS로 계산한다. `outerEdge`는 링이
 * 테두리 밖으로 나가는 폭(px)이라 0 이하이면 링 전체가 요소 안에 그려져 팝업 overflow에 잘리지 않는다.
 */
export async function focusRingOf(element: Element) {
  const css = (await loadTheme()).candidatesToCss(element.className.split(/\s+/)).join('\n');
  const ring = readFocusRing();
  const offsets = [...css.matchAll(/outline-offset:\s*([^;]+);/g)].map(([, value]) => pixels(value!.trim()));
  // 클래스가 offset을 바꾸지 않으면 base.css의 바깥 offset이 그대로 쓰인다.
  const offset = offsets.length ? Math.max(...offsets) : ring.offset;
  return { hidden: /outline-style:\s*none/.test(css), outerEdge: ring.width + offset };
}
