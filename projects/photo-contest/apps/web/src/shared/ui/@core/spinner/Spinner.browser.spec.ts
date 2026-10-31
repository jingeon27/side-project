import { expect, test } from '@playwright/test';

test('Lottie는 모바일과 넓은 화면에서 실제 SVG를 그리고 키보드와 버튼 상태를 유지해야 한다', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/?example=motion');
    await expect(page.locator('[data-motion-player] svg')).toHaveCount(8);
    await expect(page.getByRole('img', { name: '고양이' })).toBeVisible();
    await expect(page.getByRole('button', { name: '저장하는 중' })).toHaveAttribute('aria-busy', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const rotating = page.getByRole('img', { name: '불러오는 중' }).locator('g[transform]').first();
    const firstFrame = await rotating.getAttribute('transform');
    await expect.poll(() => rotating.getAttribute('transform')).not.toBe(firstFrame);
    await page.screenshot({ path: testInfo.outputPath(`motion-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: '그림 표시 전환' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('img', { name: '고양이' })).toHaveCount(0);
    await expect(page.locator('[data-motion-player] svg')).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test('모션 감소 설정에서는 정지 그림을 유지하고 설정을 바꾸면 재생을 전환해야 한다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?example=motion');
  const loading = page.getByRole('img', { name: '불러오는 중' });
  await expect(loading.locator('[data-motion-fallback]')).toBeVisible();
  await expect(loading.locator('[data-motion-player]')).toBeHidden();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(loading.locator('[data-motion-player] svg')).toBeVisible();
  await expect(loading.locator('[data-motion-fallback]')).toBeHidden();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(loading.locator('[data-motion-fallback]')).toBeVisible();
  await expect(loading.locator('[data-motion-player]')).toBeHidden();
});
