import { mkdir } from 'node:fs/promises';

import { expect, test } from './support/test';

test(
  '세션이 없을 때 데스크톱 메뉴는 MY 대신 SIGN을 보여 주고 시작하면 MY로 돌아와야 한다',
  { tag: '@desktop' },
  async ({ page }, testInfo) => {
    await page.goto('/explore');
    const menu = page.locator('[data-desktop-nav]');
    const sign = menu.getByRole('link', { name: 'SIGN', exact: true });
    await expect(sign).toHaveAttribute('href', '/sign?next=%2Fme');
    await expect(menu.getByRole('link', { name: 'MY', exact: true })).toHaveCount(0);
    await mkdir('.data/screens', { recursive: true });
    await page.screenshot({ path: `.data/screens/${testInfo.project.name}-guest-menu.png` });
    await sign.click();
    await expect(page).toHaveURL('/sign?next=%2Fme');
    await page.getByRole('button', { name: '익명으로 시작하기', exact: true }).click();
    await expect(page).toHaveURL('/me');
    await expect(menu.getByRole('link', { name: 'MY', exact: true })).toHaveAttribute('href', '/me');
  },
);
