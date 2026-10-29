import { expect, test } from '@playwright/test';

import { installNativeHost, ORIGIN } from './support/native-host';

test('알림 켜기에서만 OS 권한을 요청하고 현재 쿠키 세션에 기기를 등록해야 한다', async ({ page }) => {
  const host = await installNativeHost(page, { push: true });
  try {
    await page.request.post('/api/auth/demo', {
      headers: { Origin: ORIGIN },
      data: { nickname: '앱푸시권한' },
    });
    await page.goto('/ko/notifications');
    const settings = page.getByRole('region', { name: '앱 알림', exact: true });
    await expect(settings).toBeVisible();
    await expect.poll(() => host.pushPermissions.length).toBeGreaterThan(0);
    expect(host.pushPermissions.every((requested) => !requested)).toBe(true);
    const registered = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/push/devices/register') && response.request().method() === 'POST',
    );
    await settings.getByRole('button', { name: '알림 켜기', exact: true }).click();
    expect((await registered).status()).toBe(200);
    expect(host.pushPermissions).toContain(true);
    await expect(settings.getByRole('status')).toContainText('앱 알림을 준비하고 있어요.');
    const refreshed = page.waitForRequest(
      (request) => new URL(request.url()).pathname === '/api/notifications',
    );
    host.pushReceived();
    await refreshed;
    await expect.poll(() => host.badges.at(-1)).toBe(0);
    expect(host.messages.some((message) => JSON.stringify(message).includes('gf_session'))).toBe(false);
  } finally {
    host.dispose();
  }
});
