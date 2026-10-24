import { expect, test } from './support/test';

test(
  '기기 화면 모드를 따르고 선택한 모드는 새로고침과 서버 HTML에 유지돼야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }, testInfo) => {
    await signIn('화면모드회원');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/me');
    const root = page.locator('html');
    const surface = page.locator('header:visible');
    await expect(root).toHaveAttribute('data-theme', 'system');
    await expect(surface).toHaveCSS('background-color', 'rgb(28, 27, 26)');
    const select = page.getByRole('combobox', { name: '화면 모드', exact: true });
    await select.click();
    await page.getByRole('option', { name: '라이트 모드', exact: true }).click();
    await expect(root).toHaveAttribute('data-theme', 'light');
    await expect(surface).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await select.click();
    await page.getByRole('option', { name: '다크 모드', exact: true }).click();
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(root).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(root).toHaveAttribute('data-theme', 'dark');
    const html = await (await page.request.get('/privacy')).text();
    expect(html).toContain('data-theme="dark"');
    await page.getByRole('button', { name: '프로필 수정', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '프로필 수정', exact: true });
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('theme-dark-profile.png') });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await select.click();
    await page.getByRole('option', { name: '기기 설정에 맞춤', exact: true }).click();
    await expect(root).toHaveAttribute('data-theme', 'system');
    await expect(surface).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(surface).toHaveCSS('background-color', 'rgb(28, 27, 26)');
  },
);
