import type { Page } from '@playwright/test';

import {
  PROTOCOL_VERSION,
  type TNativeAppInfo,
  type TNativeEventPayload,
  type TNativeEventType,
  type TWebEventPayload,
  type TWebEventType,
  type TWebRequestType,
} from '@photo-contest/bridge';
import {
  buildBootstrapScript,
  buildNativeDispatchScript,
  createNativeRouter,
  type INativeRouter,
  type TNativeCapabilities,
} from '@photo-contest/bridge/native';

import { createCapabilities, type ICapabilityDependencies } from '@/features/bridge/lib/create-capabilities';
import { toWebPath } from '@/features/navigation/lib/deep-link';

import { E2E_APP_SCHEME, E2E_APP_VERSION, E2E_AUTH_CALLBACK_URL, E2E_WEB_ORIGIN } from './e2e-env';

type TAuthSessionResult = Awaited<ReturnType<ICapabilityDependencies['openAuthSession']>>;
type TAuthSessionHandler = (authUrl: string, redirectUrl: string) => Promise<TAuthSessionResult>;
type TShareAction = Awaited<ReturnType<ICapabilityDependencies['share']>>['action'];

/** 앱 기능(capabilities)이 플랫폼에 시킨 일. 실제 앱이라면 공유 시트·클립보드·진동·브라우저가 된다. */
export interface IPlatformCalls {
  shares: Parameters<ICapabilityDependencies['share']>[0][];
  copiedTexts: string[];
  impacts: string[];
  notifications: string[];
  openedLinks: string[];
  authSessions: { authUrl: string; redirectUrl: string }[];
}

export interface INativeHost {
  /** 웹이 요청한 브리지 기능과 본문 (호출 순서대로) */
  calls: { type: TWebRequestType; payload: unknown }[];
  /** 웹이 앱에 알린 이벤트 (app.ready, navigation.changed, auth.changed) */
  events: { type: TWebEventType; payload: unknown }[];
  platform: IPlatformCalls;
  router: INativeRouter;
  /** 기다리는 웹 이벤트가 이미 왔으면 바로, 아니면 올 때까지 기다린다. */
  waitForEvent: <T extends TWebEventType>(type: T, timeoutMs?: number) => Promise<TWebEventPayload<T>>;
  emit: <T extends TNativeEventType>(type: T, payload: TNativeEventPayload<T>) => void;
  /** 앱의 Android 뒤로 가기처럼 웹에 navigation.back을 묻고 응답({ handled })을 돌려준다. */
  requestBack: () => Promise<{ handled: boolean }>;
  /** 딥링크를 앱처럼 웹 경로로 바꿔 navigation.open으로 보낸다. 모르는 링크면 false. */
  openDeepLink: (url: string) => boolean;
  setShareAction: (action: TShareAction) => void;
  setCopySucceeds: (succeeds: boolean) => void;
  /** 소셜 로그인 인증 세션 결과를 정한다. 기본은 사용자가 닫은 것(cancel)이다. */
  setAuthSession: (handler: TAuthSessionHandler) => void;
  dispose: () => void;
}

interface IInstallNativeHostOptions {
  platform: 'ios' | 'android';
}

/** 앱(use-android-back-press)과 같은 대기 시간 */
const BACK_REQUEST_TIMEOUT_MS = 800;

/**
 * 웹 페이지를 앱 WebView처럼 만든다. 모바일 앱과 같은 createCapabilities·createNativeRouter·bootstrap 스크립트를 쓰고,
 * 플랫폼 기능(공유 시트·클립보드·진동·브라우저)만 기록용 가짜로 바꾼다. page.goto 전에 불러야 한다.
 */
export async function installNativeHost(
  page: Page,
  { platform }: IInstallNativeHostOptions,
): Promise<INativeHost> {
  const calls: INativeHost['calls'] = [];
  const events: INativeHost['events'] = [];
  const platformCalls: IPlatformCalls = {
    shares: [],
    copiedTexts: [],
    impacts: [],
    notifications: [],
    openedLinks: [],
    authSessions: [],
  };
  const eventWaiters: { type: TWebEventType; resolve: (payload: unknown) => void }[] = [];
  let shareAction: TShareAction = 'sharedAction';
  let copySucceeds = true;
  let authSession: TAuthSessionHandler = async () => ({ type: 'cancel' });

  const capabilities = createCapabilities({
    platform,
    apiBase: `${E2E_WEB_ORIGIN}/backend`,
    authCallbackUrl: E2E_AUTH_CALLBACK_URL,
    share: async (content) => {
      platformCalls.shares.push(content);
      return { action: shareAction };
    },
    copyText: async (text) => {
      platformCalls.copiedTexts.push(text);
      return copySucceeds;
    },
    impact: async (style) => {
      platformCalls.impacts.push(style);
    },
    notify: async (type) => {
      platformCalls.notifications.push(type);
    },
    openBrowser: async (url) => {
      platformCalls.openedLinks.push(url);
      return { type: platform === 'ios' ? 'cancel' : 'opened' };
    },
    openAuthSession: async (authUrl, redirectUrl) => {
      platformCalls.authSessions.push({ authUrl, redirectUrl });
      return authSession(authUrl, redirectUrl);
    },
    randomBytes: (count) => crypto.getRandomValues(new Uint8Array(count)),
    sha256: async (text) =>
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
  });

  const recorded: TNativeCapabilities = {};
  for (const type of Object.keys(capabilities) as TWebRequestType[]) {
    const capability = capabilities[type] as (payload: unknown) => Promise<unknown>;
    (recorded as Record<string, (payload: unknown) => Promise<unknown>>)[type] = (payload) => {
      calls.push({ type, payload });
      return capability(payload);
    };
  }

  function recordEvent(type: TWebEventType, payload: unknown) {
    events.push({ type, payload });
    for (const waiter of eventWaiters.filter((item) => item.type === type)) {
      eventWaiters.splice(eventWaiters.indexOf(waiter), 1);
      waiter.resolve(payload);
    }
  }

  const router = createNativeRouter({
    allowedOrigin: E2E_WEB_ORIGIN,
    capabilities: recorded,
    // 앱의 injectJavaScript(buildNativeDispatchScript(message))와 같은 스크립트를 페이지에서 실행한다.
    send: (message) => {
      page.evaluate(buildNativeDispatchScript(message)).catch(() => undefined);
    },
    onEvent: {
      'app.ready': (payload) => recordEvent('app.ready', payload),
      'navigation.changed': (payload) => recordEvent('navigation.changed', payload),
      'auth.changed': (payload) => recordEvent('auth.changed', payload),
    },
  });

  const info: TNativeAppInfo = {
    platform,
    appVersion: E2E_APP_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    capabilities: Object.keys(capabilities),
  };
  // 메시지를 보낸 프레임의 주소로 origin을 검사한다. 앱의 onMessage(nativeEvent.url)와 같다.
  await page.exposeBinding('__pcNativePostMessage', (source, raw: string) =>
    router.handleMessage(raw, source.frame.url()),
  );
  await page.addInitScript({
    content:
      'window.ReactNativeWebView={postMessage:function(m){window.__pcNativePostMessage(m)}};' +
      buildBootstrapScript(info),
  });

  return {
    calls,
    events,
    platform: platformCalls,
    router,
    waitForEvent: (type, timeoutMs = 15_000) => {
      const received = events.find((event) => event.type === type);
      if (received) return Promise.resolve(received.payload as TWebEventPayload<typeof type>);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`웹이 ${type}을 알리지 않았습니다.`)), timeoutMs);
        eventWaiters.push({
          type,
          resolve: (payload) => {
            clearTimeout(timer);
            resolve(payload as TWebEventPayload<typeof type>);
          },
        });
      });
    },
    emit: (type, payload) => router.emit(type, payload),
    requestBack: () => router.requestWeb('navigation.back', {}, { timeoutMs: BACK_REQUEST_TIMEOUT_MS }),
    openDeepLink: (url) => {
      const path = toWebPath(url, { webOrigin: E2E_WEB_ORIGIN, appScheme: E2E_APP_SCHEME });
      if (!path) return false;
      router.emit('navigation.open', { path });
      return true;
    },
    setShareAction: (action) => {
      shareAction = action;
    },
    setCopySucceeds: (succeeds) => {
      copySucceeds = succeeds;
    },
    setAuthSession: (handler) => {
      authSession = handler;
    },
    dispose: () => router.dispose(),
  };
}
