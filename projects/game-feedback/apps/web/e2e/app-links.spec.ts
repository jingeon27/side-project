import { expect, test } from '@playwright/test';

import { E2E_APP_LINK_ENV } from './app-link-env';

const origin = 'http://127.0.0.1:3301';
const appId = `${E2E_APP_LINK_ENV.MOBILE_APPLE_TEAM_ID}.${E2E_APP_LINK_ENV.MOBILE_IOS_BUNDLE_ID}`;
const loginCode = 'e2e-login-code-0123456789abcdefghijklmnopqrstuv';

test('standard /.well-known paths serve the App Link files from the production build', async ({
  request,
}) => {
  const association = await request.get('/.well-known/apple-app-site-association', { maxRedirects: 0 });
  expect(association.status()).toBe(200);
  expect(association.headers()['content-type']).toContain('application/json');
  expect(await association.json()).toEqual({
    applinks: { details: [{ appIDs: [appId], components: [{ '/': '/app-auth/callback' }] }] },
    webcredentials: { apps: [appId] },
  });
  const assetLinks = await request.get('/.well-known/assetlinks.json', { maxRedirects: 0 });
  expect(assetLinks.status()).toBe(200);
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
});

test('a login callback opened in the browser hides the code and asks to continue in the app', async ({
  page,
}) => {
  const requests: string[] = [];
  // 브라우저가 스스로 여는 favicon 요청은 페이지가 보내는 요청이 아니다.
  page.on('request', (request) => {
    if (!request.url().endsWith('/favicon.ico')) requests.push(request.url());
  });
  const response = await page.goto(`/app-auth/callback?code=${loginCode}`);
  expect(response?.status()).toBe(200);
  expect(response?.headers()['cache-control']).toBe('no-store');
  expect(response?.headers()['referrer-policy']).toBe('no-referrer');
  await expect(page.getByRole('heading', { name: '앱에서 로그인을 계속해 주세요', level: 1 })).toBeVisible();
  await expect(page).toHaveURL(`${origin}/app-auth/callback`);
  expect(await page.content()).not.toContain(loginCode);
  expect(requests).toEqual([`${origin}/app-auth/callback?code=${loginCode}`]);
});
