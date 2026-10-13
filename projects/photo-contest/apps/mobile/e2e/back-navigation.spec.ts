import { expect, test } from './support/fixtures';
import { signInBrowser, signUp, uniqueNickname } from './support/seed';
import { webScreens } from './support/web-screens';

test.describe('Android 뒤로 가기', () => {
  test.beforeEach(async ({ page, context, nativeHost }, testInfo) => {
    test.skip(testInfo.project.name !== 'android-webview', '하드웨어 뒤로 가기는 Android 앱만 웹에 묻는다.');
    await signInBrowser(context, await signUp(uniqueNickname('뒤로')));
    await page.goto('/');
    await nativeHost.waitForEvent('app.ready');
  });

  test('바텀시트가 열려 있으면 웹이 처리하고(handled true) 시트를 닫아야 한다', async ({
    page,
    nativeHost,
  }) => {
    await webScreens.createGroupButton(page).click();
    await expect(webScreens.dialog(page)).toBeVisible();

    await expect(nativeHost.requestBack()).resolves.toEqual({ handled: true });

    await expect(webScreens.dialog(page)).toBeHidden();
    await expect(page).toHaveURL('/');
  });

  test('홈에서 더 돌아갈 화면이 없으면 웹이 처리하지 않아야 한다(handled false)', async ({ nativeHost }) => {
    await expect(nativeHost.requestBack()).resolves.toEqual({ handled: false });
  });
});
