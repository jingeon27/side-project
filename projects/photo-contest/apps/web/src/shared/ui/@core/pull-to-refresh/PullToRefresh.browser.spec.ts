import { test as base, expect, type CDPSession } from '@playwright/test';

const test = base.extend({
  page: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await provide(page);
    expect(errors).toEqual([]);
  },
});

async function swipe(
  session: CDPSession,
  { x, y, deltaX = 0, deltaY }: { x: number; y: number; deltaX?: number; deltaY: number },
) {
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (const step of [1, 2, 3, 4, 5, 6, 7, 8]) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + (deltaX * step) / 8, y: y + (deltaY * step) / 8 }],
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '당겨서 새로고침', exact: true })).toBeVisible();
});

test('일반 세로 스크롤을 양방향으로 허용해야 한다', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', '실제 터치 주입은 Chromium CDP로 검증한다');
  const session = await page.context().newCDPSession(page);
  try {
    await swipe(session, { x: 30, y: 680, deltaY: -350 });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(50);
    const before = await page.evaluate(() => window.scrollY);
    await swipe(session, { x: 30, y: 250, deltaY: 100 });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(before);
    await expect(page.getByLabel('새로고침 횟수')).toHaveText('0');
  } finally {
    await session.detach();
  }
});

test('중첩 목록은 문서를 움직이거나 새로고침하지 않고 스크롤해야 한다', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', '실제 터치 주입은 Chromium CDP로 검증한다');
  const nested = page.getByRole('region', { name: '내부 스크롤' });
  const box = await nested.boundingBox();
  if (!box) throw new Error('내부 스크롤 영역이 보여야 한다');
  const session = await page.context().newCDPSession(page);
  try {
    await swipe(session, { x: box.x + box.width / 2, y: box.y + 150, deltaY: -120 });
    await expect.poll(() => nested.evaluate((element) => element.scrollTop)).toBeGreaterThan(20);
    const before = await nested.evaluate((element) => element.scrollTop);
    await swipe(session, { x: box.x + box.width / 2, y: box.y + 30, deltaY: 70 });
    await expect.poll(() => nested.evaluate((element) => element.scrollTop)).toBeLessThan(before);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByLabel('새로고침 횟수')).toHaveText('0');
  } finally {
    await session.detach();
  }
});

test('임계값을 넘긴 당기기만 한 번 갱신하고 표시를 접어야 한다', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', '실제 터치 주입은 Chromium CDP로 검증한다');
  const session = await page.context().newCDPSession(page);
  const counter = page.getByLabel('새로고침 횟수');
  try {
    await swipe(session, { x: 170, y: 300, deltaY: 40 });
    await expect(counter).toHaveText('0');
    await swipe(session, { x: 170, y: 300, deltaY: 180 });
    await expect(counter).toHaveText('1');
    await expect(
      page.getByRole('status', { name: '', exact: true }).filter({ hasText: /새로고침/ }),
    ).toHaveCount(0);
    await expect
      .poll(() =>
        page
          .getByRole('status', { name: '', exact: true })
          .evaluate((element) => element.getBoundingClientRect().height),
      )
      .toBeLessThan(1);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  } finally {
    await session.detach();
  }
});

test('가로 이동과 두 손가락 제스처는 갱신하지 않아야 한다', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', '실제 터치 주입은 Chromium CDP로 검증한다');
  const session = await page.context().newCDPSession(page);
  try {
    await swipe(session, { x: 100, y: 300, deltaX: 170, deltaY: 100 });
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 170, y: 300 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 170, y: 430 }] });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: 170, y: 430 },
        { x: 250, y: 430 },
      ],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: 140, y: 470 },
        { x: 280, y: 470 },
      ],
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.getByLabel('새로고침 횟수')).toHaveText('0');
  } finally {
    await session.detach();
  }
});

test('키보드 새로고침 뒤에도 포커스를 유지해야 한다', async ({ page, browserName }) => {
  const refresh = page.getByRole('button', { name: '피드 새로고침' });
  if (browserName === 'chromium') await page.keyboard.press('Tab');
  if (browserName === 'webkit') await refresh.focus();
  await expect(refresh).toBeFocused();
  await expect(refresh).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('새로고침 횟수')).toHaveText('1');
  await expect(refresh).toBeEnabled();
  await expect(refresh).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(refresh).not.toBeFocused();
});

test('모션 감소 설정에서도 갱신과 표시 정리가 동작해야 한다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.getByRole('button', { name: '피드 새로고침' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('새로고침 횟수')).toHaveText('1');
  await expect
    .poll(() =>
      page
        .getByRole('status', { name: '', exact: true })
        .evaluate((element) => element.getBoundingClientRect().height),
    )
    .toBe(0);
});
