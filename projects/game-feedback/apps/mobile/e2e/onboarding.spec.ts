import { randomUUID } from 'node:crypto';

import type { Page } from '@playwright/test';

import { appRoutes } from '@game-feedback/bridge';

import { expect, test } from './support/fixtures';
import { ORIGIN } from './support/native-host';

async function pendingSignup(page: Page, returnTo: string) {
  const start = await page.request.get(`/api/auth/social/google?returnTo=${encodeURIComponent(returnTo)}`, {
    maxRedirects: 0,
  });
  expect(start.status()).toBe(302);
  const callback = start.headers().location;
  if (!callback) throw new Error('격리 OAuth 콜백 주소가 필요합니다.');
  expect(new URL(callback, ORIGIN).origin).toBe(ORIGIN);
  const result = await page.request.get(callback, { maxRedirects: 0 });
  expect(result.status()).toBe(302);
  const onboarding = result.headers().location;
  if (!onboarding) throw new Error('가입 안내 복귀 주소가 필요합니다.');
  const route = new URL(onboarding, ORIGIN);
  expect(route.pathname + route.search).toBe(appRoutes.onboarding('ko', returnTo));
  return onboarding;
}

test('미가입 WebView는 별도 가입 화면을 보고 native back으로 앱을 종료하지 않으며 약관을 읽을 수 있어야 한다', async ({
  page,
  nativeHost,
}) => {
  const parent = appRoutes.boards('ko', 'coaching', '주말', undefined, { coachingRole: 'STUDENT' });
  await page.goto(await pendingSignup(page, parent));
  await expect.poll(nativeHost.currentPath).toBe(appRoutes.onboarding('ko', parent));
  await expect(page.getByRole('heading', { name: '회원가입', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '서비스 닉네임', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const beforeBack = nativeHost.messages.length;
  expect(await nativeHost.requestBack()).toBe(true);
  await expect
    .poll(() =>
      nativeHost.messages
        .slice(beforeBack)
        .some((message) => message.type === 'location' && message.path === parent),
    )
    .toBe(true);
  await expect.poll(nativeHost.currentPath).toBe(appRoutes.onboarding('ko', parent));
  expect(nativeHost.rootBacks()).toBe(0);
  expect(nativeHost.openDeepLink('gamefeedback://ko/privacy')).toBe(true);
  await expect(page).toHaveURL(`${ORIGIN}/ko/privacy`);
  await expect.poll(nativeHost.currentPath).toBe('/ko/privacy');
  expect((await (await page.request.get('/api/session')).json()).needsOnboarding).toBe(true);
});

test('WebView에서 가입을 완료하면 원래 게시판 필터로 복귀하고 native back이 일반 탐색으로 이어져야 한다', async ({
  page,
  nativeHost,
}) => {
  const parent = appRoutes.boards('ko', 'coaching', '주말', undefined, { coachingRole: 'STUDENT' });
  await page.goto(await pendingSignup(page, parent));
  await expect.poll(nativeHost.currentPath).toBe(appRoutes.onboarding('ko', parent));
  const nickname = `앱가입${randomUUID().slice(0, 8)}`;
  await page.getByRole('textbox', { name: '서비스 닉네임', exact: true }).fill(nickname);
  await page.getByRole('checkbox', { name: /이용약관/ }).check();
  await page.getByRole('checkbox', { name: '만 14세 이상입니다.', exact: true }).check();
  await page.getByRole('button', { name: '가입 완료하기', exact: true }).click();
  await expect.poll(nativeHost.currentPath).toBe(parent);
  await expect(page).toHaveURL(`${ORIGIN}${parent}`);
  const session = await (await page.request.get('/api/session')).json();
  expect(session.needsOnboarding).toBe(false);
  expect(session.user.nickname).toBe(nickname);
  expect(await nativeHost.requestBack()).toBe(true);
  await expect.poll(nativeHost.currentPath).toBe('/ko');
  expect(nativeHost.rootBacks()).toBe(0);
  expect(await nativeHost.requestBack()).toBe(true);
  expect(nativeHost.rootBacks()).toBe(1);
});
