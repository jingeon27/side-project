import { randomUUID } from 'node:crypto';

import type { Page } from '@playwright/test';

import {
  buildBootstrapScript,
  buildDispatchScript,
  type TLoginResult,
  type TWebMessage,
} from '@game-feedback/bridge';

import { NativeHost } from '../../src/features/bridge/lib/native-host';
import { toWebPath } from '../../src/features/navigation/lib/navigation-policy';

export const ORIGIN = 'http://127.0.0.1:3302';
class NativeHostHarness {
  readonly pushPermissions: boolean[] = [];
  readonly badges: number[] = [];
  private pushGranted = false;
  private readonly installationId = randomUUID();
  readonly messages: TWebMessage[] = [];
  readonly authSessions: string[] = [];
  readonly authCallbacks: string[] = [];
  private ready = false;
  private closed = false;
  private loginResult: TLoginResult | null = null;
  private path = '';
  private rootBackCount = 0;
  private overlayOpen = false;
  private readonly host: NativeHost;
  constructor(
    private readonly page: Page,
    private readonly push = false,
  ) {
    this.host = new NativeHost({
      origin: ORIGIN,
      ...(push
        ? {
            getPushRegistration: async (requestPermission: boolean) => {
              this.pushPermissions.push(requestPermission);
              if (requestPermission) this.pushGranted = true;
              return {
                installationId: this.installationId,
                platform: 'ios' as const,
                status: this.pushGranted ? ('granted' as const) : ('undetermined' as const),
                token: this.pushGranted ? `ExpoPushToken[${this.installationId.replaceAll('-', '')}]` : null,
              };
            },
            setPushBadge: async (count: number) => {
              this.badges.push(count);
            },
          }
        : {}),
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
      `${buildBootstrapScript('1.0.0', this.push ? ['push'] : [])}window.ReactNativeWebView={postMessage:data=>window.__gfNativePost(data,location.href)};`,
    );
    return this;
  }
  isReady = () => this.ready;
  currentPath = () => this.path;
  rootBacks = () => this.rootBackCount;
  hasOverlay = () => this.overlayOpen;
  requestBack = () => this.host.back();
  pushReceived = () => this.host.pushReceived();
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
export function installNativeHost(page: Page, options: { push?: boolean } = {}) {
  return new NativeHostHarness(page, options.push).install();
}
