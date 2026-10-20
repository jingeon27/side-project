import { test, expect } from '@playwright/test';
const origin = 'http://127.0.0.1:3301';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',
  'base64',
);
for (const width of [390, 1440]) {
  test(`프로필 링크와 사진을 미리 보고 저장·교체·삭제한다 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const login = await page.request.post('/api/auth/test-login', {
      headers: { Origin: origin },
      data: { accountId: 'sample-user-0' },
    });
    expect(login.ok()).toBe(true);
    const userId = (await login.json()).user.id as string;
    await page.goto(`/ko/users/${userId}`);
    await page.getByText('프로필 편집', { exact: true }).click();
    const links = page.getByRole('form', { name: '프로필 링크 편집' });
    await links.getByRole('button', { name: '링크 추가' }).click();
    await links.getByRole('textbox', { name: /이름/ }).fill('나의 방송');
    await links.getByRole('textbox', { name: /주소/ }).fill('https://video.example/@player');
    await links.getByRole('button', { name: '링크 저장' }).click();
    await expect(page.getByRole('link', { name: '나의 방송', exact: true })).toHaveAttribute(
      'href',
      'https://video.example/@player',
    );
    const photo = page.getByRole('form', { name: '프로필 사진 편집' });
    await photo
      .getByLabel('프로필 사진 선택', { exact: true })
      .setInputFiles({ name: 'profile.png', mimeType: 'image/png', buffer: png });
    const preview = photo.getByRole('img', { name: '선택한 프로필 사진 미리보기' });
    await expect(preview).toBeVisible();
    await expect
      .poll(() => preview.evaluate((image) => (image as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await photo.getByRole('button', { name: '사진 저장', exact: true }).click();
    await expect(preview).toBeHidden();
    await expect(page.locator('.settings-profile img')).toHaveCount(1);
    await page.reload();
    await expect(page.getByRole('link', { name: '나의 방송', exact: true })).toBeVisible();
    await page.getByText('프로필 편집', { exact: true }).click();
    await photo.getByRole('button', { name: '프로필 사진 삭제' }).click();
    await expect(page.locator('.settings-profile img')).toHaveCount(0);
    await links.getByRole('button', { name: '링크 삭제' }).click();
    await links.getByRole('button', { name: '링크 저장' }).click();
    await expect(page.getByRole('link', { name: '나의 방송', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const other = await page.request.post('/api/auth/test-login', {
      headers: { Origin: origin },
      data: { accountId: 'sample-user-3' },
    });
    expect(other.ok()).toBe(true);
    await page.goto(`/ko/users/${userId}`);
    await expect(page.getByText('프로필 편집', { exact: true })).toHaveCount(0);
  });
}
