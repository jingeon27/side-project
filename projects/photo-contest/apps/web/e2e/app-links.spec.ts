import { E2E_APP_LINK_ENV, WEB_ORIGIN } from './support/env';
import { expect, test } from './support/test';

const APP_ID = `${E2E_APP_LINK_ENV.MOBILE_APPLE_TEAM_ID}.${E2E_APP_LINK_ENV.MOBILE_IOS_BUNDLE_ID}`;
const LOGIN_CODE = 'e2e-login-code-0123456789abcdefghijklmnopqrstuv';

test(
  '표준 /.well-known 경로가 운영 빌드에서 앱 링크 검증 파일을 그대로 줘야 한다',
  { tag: ['@desktop'] },
  async ({ request }) => {
    const aasa = await request.get('/.well-known/apple-app-site-association', { maxRedirects: 0 });
    expect(aasa.status()).toBe(200);
    expect(aasa.headers()['content-type']).toContain('application/json');
    expect(await aasa.json()).toEqual({
      applinks: { details: [{ appIDs: [APP_ID], components: [{ '/': '/app-auth/callback' }] }] },
      webcredentials: { apps: [APP_ID] },
    });

    const assetLinks = await request.get('/.well-known/assetlinks.json', { maxRedirects: 0 });
    expect(assetLinks.status()).toBe(200);
    expect(assetLinks.headers()['content-type']).toContain('application/json');
    expect(await assetLinks.json()).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: E2E_APP_LINK_ENV.MOBILE_ANDROID_PACKAGE,
          sha256_cert_fingerprints: [E2E_APP_LINK_ENV.MOBILE_ANDROID_SHA256_FINGERPRINTS],
        },
      },
    ]);
  },
);

test(
  '앱 대신 브라우저에서 열린 로그인 콜백은 코드를 숨기고 앱에서 계속하라고 안내해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page }) => {
    const requests: string[] = [];
    // 브라우저가 스스로 여는 favicon 요청은 페이지가 보내는 요청이 아니다.
    page.on('request', (request) => {
      if (!request.url().endsWith('/favicon.ico')) requests.push(request.url());
    });
    const response = await page.goto(`/app-auth/callback?code=${LOGIN_CODE}`);

    expect(response?.status()).toBe(200);
    expect(response?.headers()['cache-control']).toBe('no-store');
    expect(response?.headers()['referrer-policy']).toBe('no-referrer');
    await expect(
      page.getByRole('heading', { name: '앱에서 로그인을 계속해 주세요', level: 1 }),
    ).toBeVisible();
    // 주소창·기록에서 코드를 지우고, 문서 말고는 아무 요청도 보내지 않는다.
    await expect(page).toHaveURL(`${WEB_ORIGIN}/app-auth/callback`);
    expect(await page.content()).not.toContain(LOGIN_CODE);
    expect(requests).toEqual([`${WEB_ORIGIN}/app-auth/callback?code=${LOGIN_CODE}`]);
  },
);
