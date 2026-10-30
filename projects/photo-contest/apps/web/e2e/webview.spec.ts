import { PROTOCOL_VERSION } from '@photo-contest/bridge';
import {
  buildBootstrapScript,
  buildNativeDispatchScript,
  createNativeRouter,
} from '@photo-contest/bridge/native';

import { WEB_ORIGIN } from './support/env';
import { expect, test } from './support/test';

test('가짜 앱 WebView에서도 비밀번호 가입·초대 공유·뒤로 가기가 실제 웹과 연결돼야 한다', async ({
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
          capabilities: ['share.open', 'clipboard.copy'],
        }),
    });
    await page.goto('/');
    await expect.poll(() => events).toContain('app.ready');
    await page.getByRole('tab', { name: '회원가입', exact: true }).click();
    const registration = page.getByRole('tabpanel', { name: '회원가입', exact: true });
    await registration.getByLabel('아이디', { exact: true }).fill('webview_user');
    await registration.getByLabel('닉네임', { exact: true }).fill('웹뷰-사용자');
    await registration.getByLabel('비밀번호', { exact: true }).fill('webview password 2026');
    await page.getByRole('button', { name: '가입하고 시작하기', exact: true }).click();
    await expect(page.getByRole('button', { name: /구글|Google/ })).toHaveCount(0);
    await expect(page.getByRole('region', { name: '공개 그룹 목록' })).toBeVisible();
    expect((await context.cookies()).find(({ name }) => name === 'contest_session')?.httpOnly).toBe(true);
    await page.getByRole('link', { name: 'MY', exact: true }).click();
    await expect(page).toHaveURL('/me');
    await expect(page.getByRole('heading', { name: '마이페이지', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '그룹 만들기' }).click();
    await page.getByRole('form', { name: '그룹 만들기' }).getByLabel('그룹 이름').fill('웹뷰 모임');
    await expect(router.requestWeb('navigation.back', {}, { timeoutMs: 800 })).resolves.toEqual({
      handled: true,
    });
    await expect(page).toHaveURL('/me');
    await page.getByRole('button', { name: '그룹 만들기' }).click();
    await page.getByRole('form', { name: '그룹 만들기' }).getByLabel('그룹 이름').fill('웹뷰 모임');
    await page
      .getByRole('form', { name: '그룹 만들기' })
      .getByRole('button', { name: '그룹 만들기', exact: true })
      .click();
    await expect(page).toHaveURL(/\/groups\/(?!new$)[^/]+$/);
    await page.getByText('초대와 그룹 멤버', { exact: true }).click();
    await page.getByRole('button', { name: '친구 초대하기' }).click();
    await page.getByRole('button', { name: '링크 복사', exact: true }).click();
    expect(calls).toEqual(['share.open', 'clipboard.copy']);
    expect(events).toContain('auth.changed');
  } finally {
    router.dispose();
  }
});
