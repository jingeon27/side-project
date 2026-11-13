import { expect, test } from './support/fixtures';
import { signInBrowser, signUp, uniqueNickname } from './support/seed';
import { webScreens } from './support/web-screens';

test.use({ nativePush: true });

test('알림 켜기에서 현재 WebView 세션에 기기를 등록하고 수신 시 웹 조회를 갱신해야 한다', async ({
  page,
  context,
  nativeHost,
}) => {
  await signInBrowser(context, await signUp(uniqueNickname('앱푸시')));
  await page.goto('/notifications');
  await expect(webScreens.pushSettings(page)).toBeVisible();
  await expect
    .poll(() => nativeHost.calls.filter((call) => call.type === 'notifications.registration').length)
    .toBeGreaterThan(0);
  expect(
    nativeHost.calls
      .filter((call) => call.type === 'notifications.registration')
      .every((call) => JSON.stringify(call.payload) === '{"requestPermission":false}'),
  ).toBe(true);
  const registered = page.waitForResponse(
    (response) =>
      response.url().endsWith('/backend/push/devices/register') && response.request().method() === 'POST',
  );
  await webScreens.pushEnableButton(page).click();
  expect((await registered).status()).toBe(200);
  await expect(webScreens.pushStatus(page)).toContainText('앱 알림을 준비하고 있어요.');
  const refreshed = page.waitForRequest((request) => new URL(request.url()).pathname === '/backend/graphql');
  nativeHost.emit('notifications.received', {});
  await refreshed;
  await expect.poll(() => nativeHost.calls.some((call) => call.type === 'notifications.badge')).toBe(true);
  expect(JSON.stringify(nativeHost.calls)).not.toContain('contest_session');
});
