import { createHash, randomBytes } from 'node:crypto';

import type { Page } from '@playwright/test';

import {
  buildBootstrapScript,
  buildDispatchScript,
  type TLoginResult,
  type TWebMessage,
} from '@game-feedback/bridge';

import { NativeHost } from '../../src/features/bridge/lib/native-host';
import { socialLogin } from '../../src/features/bridge/lib/social-login';
import { toWebPath } from '../../src/features/navigation/lib/navigation-policy';

export const ORIGIN = 'http://127.0.0.1:3302';
class NativeHostHarness {
  readonly messages: TWebMessage[] = [];
  readonly authSessions: string[] = [];
  private ready = false;
  private closed = false;
  private loginResult: TLoginResult | null = null;
  private path = '';
  private rootBackCount = 0;
  private overlayOpen = false;
  private readonly host: NativeHost;
  constructor(private readonly page: Page) {
    this.host = new NativeHost({
      origin: ORIGIN,
      send: (message) => {
        if (!this.closed) void this.page.evaluate(buildDispatchScript(message)).catch(() => undefined);
      },
      onReady: () => {
        this.ready = true;
      },
      onLocation: (path) => {
        this.path = path;
      },
      onRootBack: () => {
        this.rootBackCount += 1;
      },
      onOverlayChange: (open) => {
        this.overlayOpen = open;
      },
      login: (provider) =>
        this.loginResult
          ? Promise.resolve(this.loginResult)
          : socialLogin(
              ORIGIN,
              {
                randomVerifier: () => randomBytes(32).toString('base64url'),
                challenge: async (verifier) => createHash('sha256').update(verifier).digest('base64url'),
                openSession: async (url) => {
                  this.authSessions.push(url);
                  return { type: 'cancel' };
                },
              },
              provider,
            ),
    });
  }
  async install() {
    await this.page.exposeBinding('__gfNativePost', (_source, data: string, url: string) => {
      try {
        this.messages.push(JSON.parse(data) as TWebMessage);
      } catch {
        return;
      }
      this.host.receive(data, url);
    });
    await this.page.addInitScript(
      `${buildBootstrapScript('1.0.0')}window.ReactNativeWebView={postMessage:data=>window.__gfNativePost(data,location.href)};`,
    );
    return this;
  }
  isReady = () => this.ready;
  currentPath = () => this.path;
  rootBacks = () => this.rootBackCount;
  hasOverlay = () => this.overlayOpen;
  requestBack = () => this.host.back();
  state = (state: 'active' | 'background') => this.host.state(state);
  openDeepLink = (url: string) => {
    const path = toWebPath(url, ORIGIN);
    return path ? this.host.open(path) : false;
  };
  setLoginResult = (result: TLoginResult) => {
    this.loginResult = result;
  };
  dispose = () => {
    this.closed = true;
    this.host.reset();
  };
}
export function installNativeHost(page: Page) {
  return new NativeHostHarness(page).install();
}
