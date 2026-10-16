import { randomBytes, createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import {
  buildBootstrapScript,
  buildDispatchScript,
  type TLoginResult,
  type TWebMessage,
} from '@game-feedback/bridge';
import { createNativeHost } from '../../src/features/bridge/lib/create-native-host';
import { socialLogin } from '../../src/features/bridge/lib/social-login';
import { toWebPath } from '../../src/features/navigation/lib/navigation-policy';
export const ORIGIN = 'http://127.0.0.1:3302';
export async function installNativeHost(page: Page) {
  const messages: TWebMessage[] = [];
  const authSessions: string[] = [];
  let ready = false;
  let closed = false;
  let loginResult: TLoginResult | null = null;
  const host = createNativeHost({
    origin: ORIGIN,
    send: (message) => {
      if (!closed) void page.evaluate(buildDispatchScript(message)).catch(() => undefined);
    },
    onReady: () => {
      ready = true;
    },
    onLocation: () => undefined,
    login: () =>
      loginResult
        ? Promise.resolve(loginResult)
        : socialLogin(ORIGIN, {
            randomVerifier: () => randomBytes(32).toString('base64url'),
            challenge: async (verifier) => createHash('sha256').update(verifier).digest('base64url'),
            openSession: async (url) => {
              authSessions.push(url);
              return { type: 'cancel' };
            },
          }),
  });
  await page.exposeBinding('__gfNativePost', (_source, data: string, url: string) => {
    try {
      messages.push(JSON.parse(data) as TWebMessage);
    } catch {
      return;
    }
    host.receive(data, url);
  });
  await page.addInitScript(
    `${buildBootstrapScript('1.0.0')}window.ReactNativeWebView={postMessage:data=>window.__gfNativePost(data,location.href)};`,
  );
  return {
    messages,
    authSessions,
    isReady: () => ready,
    requestBack: host.back,
    state: host.state,
    openDeepLink(url: string) {
      const path = toWebPath(url, ORIGIN);
      return path ? host.open(path) : false;
    },
    setLoginResult(result: TLoginResult) {
      loginResult = result;
    },
    dispose() {
      closed = true;
      host.reset();
    },
  };
}
