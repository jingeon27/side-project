import dayjs from 'dayjs';

import { expect, test } from './support/test';

test('글쓰기의 제출 버튼은 긴 본문과 줄어든 화면에서도 하단에 보여야 한다', async ({ page }, testInfo) => {
  await page.request.post('/api/auth/test-login', {
    headers: { Origin: 'http://127.0.0.1:3301' },
    data: { accountId: 'sample-user-0' },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ko');
  await page.getByRole('button', { name: '글쓰기', exact: true }).click();
  const form = page.getByRole('form', { name: '글쓰기', exact: true });
  await expect(form).toBeVisible();
  await expect(page.getByRole('contentinfo')).toHaveCount(0);
  const footer = form.locator('[data-sticky-cta]');
  const title = form.getByRole('textbox', { name: /제목/ });
  await title.fill('화면이 줄어도 유지하는 제목');
  for (const width of [320, 390, 1440]) {
    for (const height of [844, 420]) {
      await page.setViewportSize({ width, height });
      await expect(async () => {
        const bounds = await footer.boundingBox();
        const fields = await form.locator('[data-form-scroll]').boundingBox();
        expect(bounds).not.toBeNull();
        expect(fields).not.toBeNull();
        expect(Math.abs((bounds?.y ?? 0) + (bounds?.height ?? 0) - height)).toBeLessThanOrEqual(1);
        expect((fields?.y ?? 0) + (fields?.height ?? 0)).toBeLessThanOrEqual((bounds?.y ?? 0) + 1);
      }).toPass();
      await expect(footer).toBeInViewport({ ratio: 1 });
      await expect(title).toHaveValue('화면이 줄어도 유지하는 제목');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('compose-bottom.png'), animations: 'disabled' });
  await page.evaluate(() => {
    const viewport = window.visualViewport;
    if (!viewport) throw new Error('visualViewport is required');
    Object.defineProperties(viewport, {
      height: { configurable: true, value: 420 },
      offsetTop: { configurable: true, value: 24 },
    });
    viewport.dispatchEvent(new Event('resize'));
  });
  await expect(async () => {
    const bounds = await footer.boundingBox();
    expect(Math.abs((bounds?.y ?? 0) + (bounds?.height ?? 0) - 444)).toBeLessThanOrEqual(1);
  }).toPass();
});

test('프로필 수정은 푸터 없이 하나의 저장 버튼과 스크롤 가능한 본문을 유지한다', async ({
  page,
}, testInfo) => {
  const login = await page.request.post('/api/auth/demo', {
    headers: { Origin: 'http://127.0.0.1:3301' },
    data: { nickname: `하단폼_${dayjs().valueOf().toString(36)}` },
  });
  expect(login.ok()).toBe(true);
  await page.goto('/ko/settings/profile');
  const form = page.getByRole('form', { name: '프로필 수정', exact: true });
  const footer = form.locator('[data-sticky-cta]');
  await expect(form).toBeVisible();
  await expect(page.getByRole('contentinfo')).toHaveCount(0);
  await expect(form.locator('button[type="submit"]')).toHaveCount(1);
  for (const width of [320, 390, 430, 1440]) {
    for (const height of [844, 420]) {
      await page.setViewportSize({ width, height });
      await expect(async () => {
        const bounds = await footer.boundingBox();
        const fields = await form.locator('[data-form-scroll]').boundingBox();
        expect(bounds).not.toBeNull();
        expect(fields).not.toBeNull();
        expect(Math.abs((bounds?.y ?? 0) + (bounds?.height ?? 0) - height)).toBeLessThanOrEqual(1);
        expect((fields?.y ?? 0) + (fields?.height ?? 0)).toBeLessThanOrEqual((bounds?.y ?? 0) + 1);
      }).toPass();
      await form.getByRole('textbox', { name: '자기소개', exact: true }).scrollIntoViewIfNeeded();
      await expect(footer).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width, height: 844 });
    await form.locator('[data-form-scroll]').evaluate((node) => node.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`profile-edit-bottom-${width}.png`),
      animations: 'disabled',
    });
  }
});
