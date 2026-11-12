import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { readStyle } from '../../test/color-tokens';
import { focusRingOf, loadTheme } from '../../test/tailwind-theme';
import { Disclosure, DisclosureTrigger } from './Disclosure';

/** jsdom은 Tailwind 스타일을 계산하지 않으므로 요소의 클래스가 만드는 CSS로 확인한다. svg는 className이 문자열이 아니다. */
async function cssOf(element: Element) {
  const classes = element.getAttribute('class')?.split(/\s+/) ?? [];
  return (await loadTheme()).candidatesToCss(classes).join('\n');
}

function triggerOf(label: string) {
  const trigger = screen.getByText(label).closest('summary');
  if (!trigger) throw new Error(`${label} summary를 찾을 수 없습니다.`);
  return trigger;
}

function partOf(label: string, selector: string) {
  const part = triggerOf(label).querySelector(selector);
  if (!part) throw new Error(`${label}에서 ${selector}를 찾을 수 없습니다.`);
  return part;
}

// 피식 그룹 화면의 펼침 요소가 브라우저 기본 ▶ 표시를 그대로 보였다(V18).
it('summary는 기본 ▶ 표시를 숨기고 44px 누르는 영역과 전역 포커스 링을 유지해야 한다', async () => {
  render(
    <Disclosure>
      <DisclosureTrigger>카테고리 관리</DisclosureTrigger>
      카테고리 목록
    </Disclosure>,
  );
  const trigger = triggerOf('카테고리 관리');
  const css = await cssOf(trigger);
  // Chrome·Firefox는 list-item의 ::marker로, Safari는 ::-webkit-details-marker로 ▶를 그린다.
  expect(css).toMatch(/list-style-type:\s*none;/);
  expect(css).toMatch(/::-webkit-details-marker\s*{\s*display:\s*none;/);
  // summary의 높이는 안쪽 줄이 정한다.
  expect(await cssOf(partOf('카테고리 관리', ':scope > span'))).toMatch(
    /min-height:\s*var\(--spacing-touch\)/,
  );
  expect(readStyle('theme.css')).toMatch(/--spacing-touch:\s*44px;/);
  expect((await focusRingOf(trigger)).hidden).toBe(false);
});

it('화살표는 장식으로 숨기고 중첩해도 자기 details가 열렸을 때만 돌아야 한다', async () => {
  render(
    <Disclosure open>
      <DisclosureTrigger>초대와 그룹 멤버</DisclosureTrigger>
      <Disclosure>
        <DisclosureTrigger>숨긴 게시물 관리</DisclosureTrigger>
        숨긴 게시물 목록
      </Disclosure>
    </Disclosure>,
  );
  const outer = partOf('초대와 그룹 멤버', 'svg');
  const inner = partOf('숨긴 게시물 관리', 'svg');
  expect(outer).toHaveClass('lucide-chevron-down');
  expect(outer).toHaveAttribute('aria-hidden', 'true');
  const rotated = [...(await cssOf(outer)).matchAll(/([^{}]+){\s*rotate:\s*180deg;/g)].map(
    ([, selector = '']) => selector.trim(),
  );
  // 생성된 선택자를 실제 DOM에 맞춰 본다. 바깥이 열려도 닫힌 안쪽 화살표는 돌지 않는다.
  expect(rotated.map((selector) => [outer.matches(selector), inner.matches(selector)])).toEqual([
    [true, false],
  ]);
});
