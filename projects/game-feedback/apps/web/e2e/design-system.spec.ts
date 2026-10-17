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
      probe.style.color = 'var(--color-brand)';
      document.body.append(probe);
      const brand = getComputedStyle(probe).color;
      probe.remove();
      return { height: button.getBoundingClientRect().height, background: styles.backgroundColor, brand };
    });
    expect(appearance.height).toBeGreaterThanOrEqual(44);
    expect(appearance.background).toBe(appearance.brand);
    await action.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('opacity', '1');
    await expect(dialog).toHaveAttribute('data-slot', 'dialog-content');
    const nickname = dialog.getByLabel('서비스 닉네임');
    await expect(nickname).toHaveAttribute('data-slot', 'input');
    await nickname.fill('테스트플레이어');
    const inputColors = await nickname.evaluate((input) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--color-ink)';
      document.body.append(probe);
      const foreground = getComputedStyle(probe).color;
      probe.remove();
      return { value: getComputedStyle(input).color, foreground };
    });
    expect(inputColors.value).toBe(inputColors.foreground);
    const terms = dialog.getByRole('checkbox', { name: /이용약관/ });
    await terms.check();
    await expect(terms).toBeChecked();
    await dialog.getByRole('checkbox', { name: '만 14세 이상입니다.' }).check();
    await expect(dialog.getByRole('button', { name: '데모로 시작하기', exact: true })).toBeEnabled();
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
    await page.getByRole('tab', { name: '최신 글', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tab', { name: '답변을 기다려요', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page).toHaveURL(/tab=unanswered/);
  }
});
