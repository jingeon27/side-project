import type { Page } from '@playwright/test';

import { seedPost } from './support/photos';
import { expect, seedGroup, test } from './support/test';

async function pull(page: Page, browserName: string, distance: number) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = await page.getByRole('heading', { name: '이달의 인기', exact: true }).boundingBox();
  if (!box) throw new Error('피드가 보여야 한다');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (browserName === 'chromium') {
    const session = await page.context().newCDPSession(page);
    try {
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (const step of [1, 2, 3, 4, 5, 6, 7, 8])
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: y + (distance * step) / 8 }],
        });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await session.detach();
    }
    return;
  }
  const heading = page.getByRole('heading', { name: '이달의 인기', exact: true });
  const touch = (clientY: number) => ({
    identifier: 1,
    clientX: x,
    clientY,
    screenX: x,
    screenY: clientY,
    radiusX: 1,
    radiusY: 1,
    rotationAngle: 0,
    force: 1,
  });
  for (const [type, touches, changedTouches] of [
    ['touchstart', [touch(y)], [touch(y)]],
    ['touchmove', [touch(y + distance)], [touch(y + distance)]],
    ['touchend', [], [touch(y + distance)]],
  ] as const) {
    await heading.dispatchEvent(type, { touches, targetTouches: touches, changedTouches });
  }
}

test(
  '맨 위에서 당겼다 놓으면 최신 글과 이달의 인기를 함께 새로 받아야 한다',
  { tag: '@ios' },
  async ({ page, signIn, browserName }) => {
    const cookie = await signIn('당겨서 갱신 회원');
    const group = await seedGroup(cookie, '당겨서 갱신 그룹');
    await seedPost(cookie, group.id, '처음 보인 순간');
    await page.goto('/');
    const latest = page.getByRole('region', { name: '최신 게시물', exact: true });
    const popular = page.getByRole('region', { name: '이달의 인기', exact: true });
    await expect(latest.getByRole('article')).toHaveCount(1);
    await expect(popular.getByRole('article')).toHaveCount(1);
    await seedPost(cookie, group.id, '당겨서 받은 새 순간');
    await pull(page, browserName, 40);
    await expect(latest.getByRole('article')).toHaveCount(1);
    await pull(page, browserName, 180);
    await expect(latest.getByRole('article')).toHaveCount(2);
    await expect(latest.getByRole('article').first()).toHaveAccessibleName('당겨서 받은 새 순간');
    await expect(popular.getByRole('article').first()).toHaveAccessibleName('당겨서 받은 새 순간');
    await expect(page.getByRole('button', { name: '새로고침', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  },
);

test('일반 세로 스와이프와 중첩 스크롤을 가로채지 않아야 한다', async ({ page, signIn, browserName }) => {
  test.skip(browserName !== 'chromium', '실제 터치 스크롤은 Chromium CDP로 확인한다');
  const cookie = await signIn('스크롤 유지 회원');
  await seedGroup(cookie, '스크롤 유지 그룹');
  await page.goto('/');
  const heading = page.getByRole('heading', { name: '이달의 인기', exact: true });
  await expect(heading).toBeVisible();
  await heading.evaluate((element) => {
    const content = document.createElement('div');
    content.setAttribute('data-testid', 'scroll-content');
    content.style.height = '2500px';
    const nested = document.createElement('div');
    nested.setAttribute('data-testid', 'nested-scroll');
    nested.style.cssText = 'height:200px;overflow:auto';
    const inner = document.createElement('div');
    inner.style.height = '1500px';
    nested.append(inner);
    content.append(nested);
    element.after(content);
  });
  const session = await page.context().newCDPSession(page);
  const swipe = async (x: number, y: number, deltaY: number) => {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (const step of [1, 2, 3, 4, 5, 6, 7, 8]) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y + (deltaY * step) / 8 }],
      });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  try {
    const box = await page.getByTestId('nested-scroll').boundingBox();
    if (!box) throw new Error('중첩 스크롤 영역이 보여야 한다');
    await swipe(box.x + box.width / 2, box.y + 160, -130);
    await expect
      .poll(() => page.getByTestId('nested-scroll').evaluate((element) => element.scrollTop))
      .toBeGreaterThan(20);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await swipe(30, 650, -350);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(50);
    const before = await page.evaluate(() => window.scrollY);
    await swipe(30, 250, 100);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(before);
    await expect(page.getByRole('status').filter({ hasText: '새로고침 중' })).toHaveCount(0);
  } finally {
    await session.detach();
  }
});
