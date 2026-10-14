import { Identify, createInstance } from '@amplitude/analytics-browser';
import type { TNativeAppInfo } from '@photo-contest/bridge';

import type { TAnalyticsEventName, TAnalyticsEventProperties } from './analytics.catalog';

type TAmplitudeClient = ReturnType<typeof createInstance>;

let client: TAmplitudeClient | null = null;

interface IInitAnalyticsOptions {
  /** NEXT_PUBLIC_AMPLITUDE_API_KEY. 비어 있으면 아무것도 보내지 않는다. */
  apiKey: string | undefined;
  /** 앱 WebView 안이면 브리지 앱 정보, 브라우저면 null */
  app: TNativeAppInfo | null;
}

/**
 * 브라우저에서 한 번만 초기화한다. 키가 없거나 서버 렌더링이면 아무것도 하지 않아 이후 호출도 모두 no-op이 된다.
 * 앱 안이면 네이티브와 같은 기기 ID(analyticsDeviceId)를 써서 앱·웹 이벤트를 한 사람으로 묶는다.
 */
export function initAnalytics({ apiKey, app }: IInitAnalyticsOptions) {
  if (typeof window === 'undefined' || !apiKey || client) return;
  const instance = createInstance();
  instance.init(apiKey, {
    // 페이지뷰는 경로 이름표(path_template)로 직접 보낸다. 자동 수집은 ID·토큰이 든 URL을 그대로 보낸다.
    autocapture: {
      pageViews: false,
      attribution: false,
      formInteractions: false,
      fileDownloads: false,
      elementInteractions: false,
    },
    trackingOptions: { ipAddress: false },
    ...(app?.analyticsDeviceId ? { deviceId: app.analyticsDeviceId } : {}),
    ...(app ? { appVersion: app.appVersion } : {}),
  });
  const identify = new Identify().set('client', app ? 'app' : 'web');
  if (app) identify.set('platform', app.platform).set('app_version', app.appVersion);
  instance.identify(identify);
  client = instance;
}

/** 카탈로그에 있는 이벤트만 보낸다. 초기화 전이거나 키가 없으면 버린다. */
export function trackEvent<TName extends TAnalyticsEventName>(
  name: TName,
  properties: TAnalyticsEventProperties[TName],
) {
  client?.track(name, properties);
}

/** 로그인한 사용자. 같은 ID로 여러 번 불러도 된다. */
export function identifyUser(userId: string) {
  if (client?.getUserId() === userId) return;
  client?.setUserId(userId);
}

/** 로그아웃. 다음 사용자의 이벤트가 이전 사용자에게 붙지 않게 사용자·기기 정보를 새로 만든다. */
export function resetAnalytics() {
  client?.reset();
}

/** 문서를 떠나기 직전(외부 로그인 이동 등)에 쌓인 이벤트를 보낸다. 오래 걸리면 기다리지 않는다. */
export async function flushAnalytics(timeoutMs = 400) {
  if (!client) return;
  await Promise.race([
    client.flush().promise.catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/** 테스트 전용: 초기화 상태를 지운다. */
export function resetAnalyticsClientForTest() {
  client = null;
}
