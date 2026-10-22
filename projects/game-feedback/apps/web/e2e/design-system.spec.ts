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
    await expect(action).toHaveAttribute('data-slot', 'button');
    const appearance = await action.evaluate((button) => {
      const styles = getComputedStyle(button);
      const probe = document.createElement('span');
      probe.style.color = 'var(--color-accent)';
      document.body.append(probe);
      const brand = getComputedStyle(probe).color;
      probe.remove();
      return { height: button.getBoundingClientRect().height, background: styles.backgroundColor, brand };
    });
    expect(appearance.height).toBeGreaterThanOrEqual(44);
    expect(appearance.background).toBe(appearance.brand);
    await page.request.post('/api/auth/test-token', {
      headers: { Origin: 'http://127.0.0.1:3301' },
      data: { accountId: 'sample-user-0' },
    });
    await page.goto('/ko/settings');
    await page.getByRole('button', { name: '계정 등록', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('opacity', '1');
    await expect(dialog).toHaveAttribute('data-slot', 'bottom-sheet-content');
    const nickname = dialog.getByLabel('플레이어 태그');
    await expect(nickname).toHaveAttribute('data-slot', 'input');
    await nickname.fill('#GG829JGY');
    const inputColors = await nickname.evaluate((input) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--color-ink)';
      document.body.append(probe);
      const foreground = getComputedStyle(probe).color;
      probe.remove();
      return { value: getComputedStyle(input).color, foreground };
    });
    expect(inputColors.value).toBe(inputColors.foreground);
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
    await page.goto('/ko');
    const unanswered = page.getByRole('button', { name: '답변 대기', exact: true });
    await unanswered.focus();
    await page.keyboard.press('Enter');
    await expect(unanswered).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/tab=unanswered/);
    await page.keyboard.press('Enter');
    await expect(unanswered).toHaveAttribute('aria-pressed', 'false');
    await expect(page).toHaveURL((url) => !url.searchParams.has('tab'));
  }
});
