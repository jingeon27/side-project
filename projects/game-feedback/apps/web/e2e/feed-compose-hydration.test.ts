import { expect, test } from './support/test';

for (const width of [320, 400, 1440]) {
  test(`${width}px 홈의 첫 화면에서 글쓰기를 바로 눌러도 로그인 안내가 열려야 한다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/ko', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '글쓰기', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '로그인이 필요해요', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL('/ko');
    await expect(page.getByRole('button', { name: '글쓰기', exact: true })).toHaveCount(1);
  });
}
