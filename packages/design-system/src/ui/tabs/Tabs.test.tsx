import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';

import { colorModes, contrastRatio, readThemeTokens, resolveColor } from '../../test/color-tokens';
import { loadTheme } from '../../test/tailwind-theme';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

const colorTokens = new Set(Object.keys(readThemeTokens()));

/** 클래스 목록에서 `prefix` 뒤가 색 토큰인 첫 값을 고른다(`text-label` 같은 글자 크기는 건너뛴다). */
function colorOf(element: HTMLElement, prefix: string) {
  return element.className
    .split(/\s+/)
    .map((name) => (name.startsWith(prefix) ? name.slice(prefix.length) : ''))
    .find((token) => colorTokens.has(token));
}

// 다크 모드에서 선택 칸 바탕(surface/sunken 1.07:1)과 글자색(ink/muted 1.97:1)만으로는 선택 칸이 구분되지 않았다.
it.each(colorModes)(
  '%s 모드에서 기본 탭의 선택 칸은 비선택 칸과 3:1 이상 구분돼야 한다(WCAG 1.4.11)',
  (mode) => {
    render(
      <Tabs defaultValue="latest">
        <TabsList aria-label="피드 분류">
          <TabsTrigger value="latest">최신 글</TabsTrigger>
          <TabsTrigger value="popular">인기 글</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const list = screen.getByRole('tablist', { name: '피드 분류' });
    const tab = screen.getByRole('tab', { name: '최신 글' });
    const listBackground = colorOf(list, 'bg-');
    const pairs = [
      [colorOf(tab, 'data-active:text-'), colorOf(tab, 'text-')],
      [colorOf(tab, 'data-active:bg-'), listBackground],
      [colorOf(tab, 'data-active:border-'), listBackground],
    ].filter((pair): pair is [string, string] => pair.every(Boolean));
    const ratios = pairs.map(([active, inactive]) =>
      contrastRatio(resolveColor(active, mode), resolveColor(inactive, mode)),
    );
    expect(Math.max(...ratios), pairs.join(' | ')).toBeGreaterThanOrEqual(3);
  },
);

it('기본 탭에 테두리를 더해도 누르는 영역은 44px 높이여야 한다', async () => {
  render(
    <Tabs defaultValue="latest">
      <TabsList aria-label="피드 분류">
        <TabsTrigger value="latest">최신 글</TabsTrigger>
      </TabsList>
    </Tabs>,
  );
  const tab = screen.getByRole('tab', { name: '최신 글' });
  const beforeClasses = tab.className.split(/\s+/).filter((name) => name.startsWith('before:'));
  const css = (await loadTheme()).candidatesToCss(beforeClasses).join('\n');
  // 가상 요소는 테두리 안쪽을 기준으로 놓여 위아래 inset으로 넓히면 테두리만큼 작아지므로 높이를 직접 정한다.
  expect(css).toMatch(/height:\s*var\(--spacing-touch\)/);
});

it('포커스할 내용이 없는 패널도 Tab으로 들어가면 포커스 링이 보여야 한다', async () => {
  const user = userEvent.setup();
  render(
    <Tabs defaultValue="latest">
      <TabsList aria-label="피드 분류">
        <TabsTrigger value="latest">최신 글</TabsTrigger>
      </TabsList>
      <TabsContent value="latest">전체 글 목록</TabsContent>
    </Tabs>,
  );
  await user.tab();
  expect(screen.getByRole('tab', { name: '최신 글' })).toHaveFocus();
  await user.tab();
  const panel = screen.getByRole('tabpanel', { name: '최신 글' });
  expect(panel).toHaveFocus();
  // 패널은 전역 :focus-visible outline을 그대로 쓴다(outline-none·ring으로 바꾸면 forced-colors에서 사라진다).
  expect(panel.className).not.toMatch(/outline-(none|hidden)|focus-visible:ring/);
});
