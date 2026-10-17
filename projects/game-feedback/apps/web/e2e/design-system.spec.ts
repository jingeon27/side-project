import { expect, test } from '@playwright/test';

test('shared controls keep their theme, readable inputs, and usable size on mobile and desktop', async ({
  page,
}) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/ko');
    const action = page.getByRole('button', { name: '글쓰기', exact: true });
    await expect(action).toBeVisible();
    const appearance = await action.evaluate((button) => {
      const styles = getComputedStyle(button);
      const probe = document.createElement('span');
      probe.style.color = 'var(--color-brand)';
      document.body.append(probe);
      const brand = getComputedStyle(probe).color;
      probe.remove();
      return { height: button.getBoundingClientRect().height, background: styles.backgroundColor, brand };
    });
    expect(appearance.height).toBeGreaterThanOrEqual(44);
    expect(appearance.background).toBe(appearance.brand);
    await page.getByRole('button', { name: '로그인 / 시작하기', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('opacity', '1');
    const nickname = dialog.getByLabel('서비스 닉네임');
    expect(
      await nickname.evaluate((input) => Number.parseFloat(getComputedStyle(input).fontSize)),
    ).toBeGreaterThanOrEqual(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.screenshot({
      path: `test-results/shared-design-${viewport.width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(dialog).not.toBeVisible();
  }
});
