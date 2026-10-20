import { expect, test } from '@playwright/test';

test('320px 홈은 폭이 넓은 대체 글꼴에서도 제목과 두 동작을 화면 안에 표시한다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/en');
  await page.addStyleTag({ content: 'body { font-family: Verdana, sans-serif !important; }' });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  for (const name of ['Unanswered', 'Write a post']) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
});
