import { createHash, randomBytes } from 'node:crypto';

import { PROTOCOL_VERSION } from '@photo-contest/bridge';
import {
  buildBootstrapScript,
  buildNativeDispatchScript,
  createNativeRouter,
} from '@photo-contest/bridge/native';
import { createTestAppLoginTicket } from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './support/env';
import { expect, test } from './support/test';

test('가짜 앱 WebView에서도 로그인 교환·초대 공유·뒤로 가기가 실제 웹과 연결돼야 한다', async ({
  page,
  context,
}) => {
  const calls: string[] = [];
  const events: string[] = [];
  const router = createNativeRouter({
    allowedOrigin: WEB_ORIGIN,
    send: (message) => {
      page.evaluate(buildNativeDispatchScript(message)).catch(() => undefined);
    },
    onEvent: {
      'app.ready': () => {
        events.push('app.ready');
      },
      'auth.changed': () => {
        events.push('auth.changed');
      },
    },
    capabilities: {
      'auth.socialLogin': async () => {
        calls.push('auth.socialLogin');
        const verifier = randomBytes(32).toString('base64url');
        const challenge = createHash('sha256').update(verifier).digest('base64url');
        const ticket = await createTestAppLoginTicket(API_URL, {
          nickname: '웹뷰-사용자',
          challenge,
          origin: WEB_ORIGIN,
        });
        return { code: ticket.code, verifier };
      },
      'share.open': async () => {
        calls.push('share.open');
        return { shared: true };
      },
      'clipboard.copy': async () => {
        calls.push('clipboard.copy');
        return { copied: true };
      },
    },
  });
  try {
    await page.exposeBinding('__pcPost', (source, raw: string) =>
      router.handleMessage(raw, source.frame.url()),
    );
    await page.addInitScript({
      content:
        'window.ReactNativeWebView={postMessage:function(m){window.__pcPost(m)}};' +
        buildBootstrapScript({
          platform: 'android',
          appVersion: '1.0.0',
          protocolVersion: PROTOCOL_VERSION,
          capabilities: ['auth.socialLogin', 'share.open', 'clipboard.copy'],
        }),
    });
    await page.goto('/');
    await expect.poll(() => events).toContain('app.ready');
    await page.getByRole('button', { name: /구글|Google/ }).click();
    await expect(page.getByRole('heading', { name: '최신 게시물' })).toBeVisible();
    expect((await context.cookies()).find(({ name }) => name === 'contest_session')?.httpOnly).toBe(true);
    await page.getByRole('link', { name: 'MY', exact: true }).click();
    await page.getByRole('button', { name: '갤러리 만들기' }).click();
    await page.getByRole('dialog').getByLabel('갤러리 이름').fill('웹뷰 모임');
    await expect(router.requestWeb('navigation.back', {}, { timeoutMs: 800 })).resolves.toEqual({
      handled: true,
    });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: '갤러리 만들기' }).click();
    await page.getByRole('dialog').getByLabel('갤러리 이름').fill('웹뷰 모임');
    await page.getByRole('dialog').getByRole('button', { name: '갤러리 만들기', exact: true }).click();
    await expect(page).toHaveURL(/\/groups\/[^/]+$/);
    await page.getByText('초대와 갤러리 멤버', { exact: true }).click();
    await page.getByRole('button', { name: '친구 초대하기' }).click();
    await page.getByRole('button', { name: '링크 복사', exact: true }).click();
    expect(calls).toEqual(['auth.socialLogin', 'share.open', 'clipboard.copy']);
    expect(events).toContain('auth.changed');
  } finally {
    router.dispose();
  }
});
