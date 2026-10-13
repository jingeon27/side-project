import { expect, test } from './support/fixtures';
import { seedGroup, signInBrowser, signUp, uniqueNickname } from './support/seed';
import { webScreens } from './support/web-screens';

test.describe('앱 셸', () => {
  test('앱 WebView로 열면 앱 표식을 붙이고 준비되면 app.ready를 알려야 한다', async ({
    page,
    nativeHost,
  }) => {
    await page.goto('/');

    await expect(webScreens.appMarker(page)).toHaveCount(1);
    await expect(nativeHost.waitForEvent('app.ready')).resolves.toEqual({ path: '/' });
  });

  test('딥링크(navigation.open)를 받으면 그 화면으로 이동해야 한다', async ({
    page,
    context,
    nativeHost,
  }) => {
    const cookie = await signUp(uniqueNickname('딥링크'));
    const group = await seedGroup(cookie, '딥링크 모임');
    await signInBrowser(context, cookie);
    await page.goto('/');
    await nativeHost.waitForEvent('app.ready');

    expect(nativeHost.openDeepLink(`photocontest://groups/${group.id}`)).toBe(true);

    await expect(page).toHaveURL(`/groups/${group.id}`);
    await expect(page.getByText('딥링크 모임').first()).toBeVisible();
  });

  test('앱이 background에서 돌아오면(app.state active) 화면 데이터를 다시 불러와야 한다', async ({
    page,
    context,
    nativeHost,
  }) => {
    await signInBrowser(context, await signUp(uniqueNickname('복귀')));
    await page.goto('/');
    await nativeHost.waitForEvent('app.ready');
    await page.waitForLoadState('networkidle');

    const refetch = page.waitForRequest(
      (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/backend/graphql',
    );
    nativeHost.emit('app.state', { state: 'background' });
    nativeHost.emit('app.state', { state: 'active' });

    await expect(refetch).resolves.toBeTruthy();
  });

  test('다른 origin에서 보낸 메시지는 앱 기능을 부르지 못해야 한다', async ({ page, nativeHost }) => {
    await page.goto('/');
    await nativeHost.waitForEvent('app.ready');

    // 웹 origin이 아닌 문서 주소로 들어온 메시지라고 가정하고 라우터에 직접 넣는다.
    await nativeHost.router.handleMessage(
      JSON.stringify({ v: 1, kind: 'request', id: 'evil-1', type: 'clipboard.copy', payload: { text: 'x' } }),
      'https://evil.example/',
    );

    expect(nativeHost.platform.copiedTexts).toEqual([]);
  });
});
