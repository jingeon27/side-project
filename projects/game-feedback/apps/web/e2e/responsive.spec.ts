import { test, expect } from '@playwright/test';

for (const width of [320, 390, 768, 1440]) {
  test(`responsive screens and chat stay within a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ['/en', '/ja/settings', '/en/posts/sample-post-0', '/en/users/sample-user-0']) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await page.request.post('/api/auth/test-login', {
      headers: { Origin: 'http://127.0.0.1:3301' },
      data: { accountId: width === 320 || width === 768 ? 'sample-user-0' : 'sample-user-3' },
    });
    await page.goto('/en');
    await page.getByRole('button', { name: 'Ask for feedback', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width + 1);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await page.goto('/en/messages/sample-conversation-0-3');
    const input = page.getByRole('textbox', { name: 'Message', exact: true });
    await expect(input).toBeVisible();
    if (width <= 760) {
      await expect(page.getByRole('navigation', { name: 'Mobile menu' })).toBeHidden();
      await page.setViewportSize({ width, height: 420 });
      await input.fill('A draft stays visible after the viewport shrinks');
      await expect(input).toHaveValue('A draft stays visible after the viewport shrinks');
      const composer = await input.boundingBox();
      expect((composer?.y ?? 0) + (composer?.height ?? 0)).toBeLessThanOrEqual(421);
      await page.getByRole('link', { name: 'Back to conversations', exact: true }).click();
      await expect(page.getByRole('navigation', { name: 'Mobile menu' })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
