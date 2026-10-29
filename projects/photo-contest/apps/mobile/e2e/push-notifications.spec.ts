import { expect, test } from '@playwright/test';

import { installNativeHost } from './support/native-host';
import { signInBrowser, signUp, uniqueNickname } from './support/seed';

test('알림 켜기에서 현재 WebView 세션에 기기를 등록하고 수신 시 웹 조회를 갱신해야 한다', async ({
  page,
  context,
}) => {
  const host = await installNativeHost(page, { platform: 'android', push: true });
  try {
    await signInBrowser(context, await signUp(uniqueNickname('앱푸시')));
    await page.goto('/notifications');
    const settings = page.getByRole('region', { name: '앱 알림', exact: true });
    await expect(settings).toBeVisible();
    await expect
      .poll(() => host.calls.filter((call) => call.type === 'notifications.registration').length)
      .toBeGreaterThan(0);
    expect(
      host.calls
        .filter((call) => call.type === 'notifications.registration')
        .every((call) => JSON.stringify(call.payload) === '{"requestPermission":false}'),
    ).toBe(true);
    const registered = page.waitForResponse(
      (response) =>
        response.url().endsWith('/backend/push/devices/register') && response.request().method() === 'POST',
    );
    await settings.getByRole('button', { name: '알림 켜기', exact: true }).click();
    expect((await registered).status()).toBe(200);
    await expect(settings.getByRole('status')).toContainText('앱 알림을 준비하고 있어요.');
    const refreshed = page.waitForRequest(
      (request) => new URL(request.url()).pathname === '/backend/graphql',
    );
    host.emit('notifications.received', {});
    await refreshed;
    await expect.poll(() => host.calls.some((call) => call.type === 'notifications.badge')).toBe(true);
    expect(JSON.stringify(host.calls)).not.toContain('contest_session');
  } finally {
    host.dispose();
  }
});
