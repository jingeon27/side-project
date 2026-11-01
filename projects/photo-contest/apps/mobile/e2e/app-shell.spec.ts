import { mkdir } from 'node:fs/promises';

import { expect, test } from './support/fixtures';
import { seedGroup, seedLinkPost, signInBrowser, signUp, uniqueNickname } from './support/seed';
import { webScreens } from './support/web-screens';

test.describe('앱 셸', () => {
  test('앱 WebView로 열면 앱 표식을 붙이고 준비되면 app.ready를 알려야 한다', async ({
    page,
    nativeHost,
  }) => {
    await page.goto('/');

    await expect(webScreens.appMarker(page)).toHaveCount(1);
    await expect(nativeHost.waitForEvent('app.ready')).resolves.toEqual({ path: '/sign?next=%2F' });
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

  test('별도 소개 페이지는 로그인 없이 열고 시작하기는 기존 메인 인증으로 이어져야 한다', async ({
    page,
    nativeHost,
  }) => {
    const apiRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/backend/')) apiRequests.push(request.url());
    });
    await page.goto('/about');
    await expect(webScreens.landingHero(page)).toBeVisible();
    await expect(nativeHost.waitForEvent('app.ready')).resolves.toEqual({ path: '/about' });
    await page.waitForLoadState('networkidle');
    expect(apiRequests).toEqual([]);
    await expect(webScreens.homeLink(page)).toHaveCount(0);
    await webScreens.landingStart(page).click();
    await expect(page).toHaveURL('/sign?next=%2F');
  });

  test('앱 메인은 루트의 게시물 피드와 홈 탭을 유지하고 화면 폭을 넘지 않아야 한다', async ({
    page,
    context,
    nativeHost,
  }, testInfo) => {
    const cookie = await signUp(uniqueNickname('메인 확인'));
    const group = await seedGroup(cookie);
    await seedLinkPost(cookie, group.id);
    await signInBrowser(context, cookie);
    await page.goto('/');
    await expect(nativeHost.waitForEvent('app.ready')).resolves.toEqual({ path: '/' });
    await expect(webScreens.homeHeading(page)).toBeVisible();
    await expect(webScreens.postCard(page)).toBeVisible();
    await expect(webScreens.homeLink(page)).toHaveAttribute('aria-current', 'page');
    await expect(webScreens.landingHero(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mkdir('.data/screens', { recursive: true });
    await page.screenshot({ path: `.data/screens/${testInfo.project.name}-home.png`, fullPage: true });
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
