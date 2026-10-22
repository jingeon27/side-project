import { E2E_WEB_ORIGIN } from './support/e2e-env';
import { expect, test } from './support/fixtures';
import { issueAppLoginTicket } from './support/seed';
import { webScreens } from './support/web-screens';

const APP_CHALLENGE = /[?&]app_challenge=([A-Za-z0-9_-]{43})(?:&|$)/;

test.describe('앱 소셜 로그인 핸드오프', () => {
  test.beforeEach(async ({ page, nativeHost }) => {
    await page.goto('/');
    await nativeHost.waitForEvent('app.ready');
  });

  test('소셜 로그인 버튼은 시스템 브라우저 인증(auth.socialLogin)을 열어야 한다', async ({
    page,
    nativeHost,
  }) => {
    await webScreens.socialLoginButton(page, 'google').click();

    await expect.poll(() => nativeHost.platform.authSessions).toHaveLength(1);
    expect(nativeHost.calls).toContainEqual({ type: 'auth.socialLogin', payload: { provider: 'google' } });
    const [session] = nativeHost.platform.authSessions;
    expect(session?.authUrl).toMatch(new RegExp(`^${E2E_WEB_ORIGIN}/backend/auth/google\\?app_challenge=`));
    expect(session?.redirectUrl).toBe('photocontest://auth/callback');
    // 웹 WebView는 provider 페이지로 직접 이동하지 않는다.
    await expect(page).toHaveURL(`${E2E_WEB_ORIGIN}/`);
  });

  test('사용자가 인증을 취소하면 조용히 로그인 화면에 머물러야 한다', async ({ page, nativeHost }) => {
    nativeHost.setAuthSession(async () => ({ type: 'cancel' }));

    await webScreens.socialLoginButton(page, 'google').click();

    await expect.poll(() => nativeHost.platform.authSessions).toHaveLength(1);
    await expect(webScreens.toast(page).filter({ hasText: /실패|오류/ })).toHaveCount(0);
    await expect(webScreens.socialLoginButton(page, 'google')).toBeVisible();
  });

  test('인증이 실패하면 토스트로 알려야 한다', async ({ page, nativeHost }) => {
    nativeHost.setAuthSession(async (_authUrl, redirectUrl) => ({
      type: 'success',
      url: `${redirectUrl}?error=login_failed`,
    }));

    await webScreens.socialLoginButton(page, 'google').click();

    await expect(webScreens.toast(page).filter({ hasText: /로그인에 실패/ })).toBeVisible();
  });

  test('앱이 받은 코드를 웹이 교환하면 WebView 쿠키로 로그인돼야 한다', async ({
    page,
    context,
    nativeHost,
  }) => {
    let nickname = '';
    nativeHost.setAuthSession(async (authUrl, redirectUrl) => {
      const challenge = authUrl.match(APP_CHALLENGE)?.[1] ?? '';
      const ticket = await issueAppLoginTicket(challenge);
      nickname = ticket.nickname;
      return { type: 'success', url: `${redirectUrl}?code=${ticket.code}` };
    });

    await webScreens.socialLoginButton(page, 'google').click();

    // 비로그인 첫 화면도 signedIn:false를 알리므로 첫 이벤트가 아니라 로그인 알림을 기다린다.
    await expect
      .poll(() => nativeHost.events)
      .toContainEqual({ type: 'auth.changed', payload: { signedIn: true } });
    const cookies = await context.cookies(E2E_WEB_ORIGIN);
    expect(cookies.find((cookie) => cookie.name === 'contest_session')?.httpOnly).toBe(true);
    // 첫 알림은 문서 이동 전이다. 새 문서가 세션을 읽고 사용자 ID를 알린 뒤 메뉴를 누른다.
    await expect
      .poll(() => nativeHost.events)
      .toContainEqual({
        type: 'auth.changed',
        payload: { signedIn: true, userId: expect.any(String) },
      });
    await webScreens.myPageLink(page).click();
    await expect(page).toHaveURL(`${E2E_WEB_ORIGIN}/me`);
    await expect(webScreens.profileHeading(page, nickname)).toBeVisible();
  });
});
