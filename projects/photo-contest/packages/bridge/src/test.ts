import { createNativeRouter } from './native';
import type { INativeRouter, TNativeCapabilities } from './native';
import { APP_MARKER_KEY, NATIVE_EVENT_NAME, PROTOCOL_VERSION } from './protocol';
import type { TWebRequestType } from './protocol';
import type { TBridgeWindow } from './web';

type TFakeWindow = TBridgeWindow & Pick<Window, 'dispatchEvent' | 'location'>;

interface IFakeNativeAppOptions {
  capabilities: TNativeCapabilities;
  platform?: 'ios' | 'android';
  appVersion?: string;
}

export interface IFakeNativeApp {
  /** 웹이 요청한 기능과 본문 (호출 순서대로) */
  calls: Array<{ type: TWebRequestType; payload: unknown }>;
  router: INativeRouter;
  uninstall: () => void;
}

/** 테스트 전용. window에 앱 WebView 환경을 흉내 내고 요청을 capabilities로 보낸다. 프로덕션 코드는 import하지 않는다. */
export function installFakeNativeApp(
  win: TFakeWindow,
  { capabilities, platform = 'ios', appVersion = '1.0.0' }: IFakeNativeAppOptions,
): IFakeNativeApp {
  const calls: IFakeNativeApp['calls'] = [];
  const recorded: TNativeCapabilities = {};
  for (const type of Object.keys(capabilities) as TWebRequestType[]) {
    const capability = capabilities[type] as (payload: unknown) => Promise<unknown>;
    (recorded as Record<string, (payload: unknown) => Promise<unknown>>)[type] = (payload) => {
      calls.push({ type, payload });
      return capability(payload);
    };
  }
  const router = createNativeRouter({
    allowedOrigin: win.location.origin,
    capabilities: recorded,
    send: (message) =>
      win.dispatchEvent(new CustomEvent(NATIVE_EVENT_NAME, { detail: JSON.stringify(message) })),
  });
  win[APP_MARKER_KEY] = {
    platform,
    appVersion,
    protocolVersion: PROTOCOL_VERSION,
    capabilities: Object.keys(capabilities),
  };
  win.ReactNativeWebView = {
    postMessage: (raw) => void router.handleMessage(raw, win.location.href),
  };
  return {
    calls,
    router,
    uninstall: () => {
      router.dispose();
      delete win.ReactNativeWebView;
      delete win[APP_MARKER_KEY];
    },
  };
}
