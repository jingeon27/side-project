import { instant } from '@next/playwright';
import type { Page, Route } from '@playwright/test';

import { expect, seedGroup, test } from './support/test';

async function verifyInstant(page: Page, browserName: string, check: () => Promise<void>) {
  if (browserName !== 'webkit') return instant(page, check);
  // WebKit에서는 실제 RSC 탐색 요청을 보류해 같은 준비된 UI를 검증한다.
  const gate = Promise.withResolvers<void>();
  const origin = new URL(page.url()).origin;
  const matches = (url: URL) => url.origin === origin;
  const pauseNavigation = async (route: Route) => {
    const headers = route.request().headers();
    if (headers.rsc === '1' && !headers['next-router-prefetch']) await gate.promise;
    await route.continue();
  };
  await page.route(matches, pauseNavigation);
  try {
    await check();
  } finally {
    gate.resolve();
    await page.unrouteAll({ behavior: 'wait' });
  }
}

test(
  '그룹 메뉴는 본문 응답을 기다리는 동안에도 목적지와 선택 상태를 바로 표시해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn, browserName }) => {
    const cookie = await signIn('즉시 탐색');
    const group = await seedGroup(cookie, '바로 이동하는 그룹');
    await page.goto(`/groups/${group.id}`);
    await expect(page.getByRole('navigation', { name: '그룹 메뉴' })).toBeVisible();

    for (const [label, path] of [
      ['대회', `/groups/${group.id}/contests`],
      ['명예의 전당', `/groups/${group.id}/hall-of-fame`],
      ['게시물', `/groups/${group.id}`],
    ] as const) {
      await verifyInstant(page, browserName, async () => {
        await page
          .getByRole('navigation', { name: '그룹 메뉴' })
          .getByRole('link', { name: label, exact: true })
          .click();
        await expect(page).toHaveURL(path);
        await expect(
          page.getByRole('navigation', { name: '그룹 메뉴' }).getByRole('link', { name: label, exact: true }),
        ).toHaveAttribute('aria-current', 'page');
        if (browserName !== 'webkit' || label !== '게시물')
          await expect(page.getByRole('status', { name: '그룹 본문 불러오는 중' })).toBeVisible();
      });
      await expect(page.getByRole('status', { name: '그룹 본문 불러오는 중' })).toHaveCount(0);
    }
  },
);

test(
  '홈·탐색·MY는 본문을 기다리는 동안 헤더와 선택된 메뉴를 유지해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn, browserName }) => {
    const cookie = await signIn('주요 메뉴 즉시 이동');
    await seedGroup(cookie, '주요 메뉴 확인 그룹');
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '참여한 그룹', exact: true })).toBeVisible();
    const navigation = page.locator('[data-bottom-nav]:visible, [data-desktop-nav]:visible');
    for (const [label, path, title, loading] of [
      ['탐색', '/explore', '그룹 탐색', '그룹 목록 불러오는 중'],
      ['MY', '/me', '마이페이지', '내 정보 불러오는 중'],
      ['홈', '/', '홈', '피드 불러오는 중'],
    ] as const) {
      await verifyInstant(page, browserName, async () => {
        await navigation.getByRole('link', { name: label, exact: true }).click();
        await expect(page).toHaveURL(path);
        await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
        await expect(navigation.getByRole('link', { name: label, exact: true })).toHaveAttribute(
          'aria-current',
          'page',
        );
        if (browserName !== 'webkit' || label !== '홈')
          await expect(page.getByRole('status', { name: loading })).toBeVisible();
      });
      await expect(page.getByRole('status', { name: loading })).toHaveCount(0);
    }
  },
);
