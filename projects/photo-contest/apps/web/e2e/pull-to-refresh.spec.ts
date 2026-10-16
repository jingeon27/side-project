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
      for (let step = 1; step <= 8; step++)
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
    const group = await seedGroup(cookie, '당겨서 갱신 갤러리');
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
