import type * as Amplitude from '@amplitude/analytics-react-native';
import type { TWebEventPayload } from '@photo-contest/bridge';

import type { TAnalyticsEvent } from '../config/events';

export type TAnalyticsSdk = Pick<
  typeof Amplitude,
  'init' | 'track' | 'getDeviceId' | 'getUserId' | 'setUserId' | 'reset'
>;

/** 초기화가 늦어도 WebView를 이만큼만 기다린다. 넘기면 웹은 자기 기기 ID를 쓴다. */
const START_TIMEOUT_MS = 1_500;
/** 웹에 넘기는 앱 정보 스키마의 길이 제한. 벗어나면 웹이 앱 정보 전체를 버린다. */
const MAX_DEVICE_ID_LENGTH = 128;

const INIT_OPTIONS = {
  // 카탈로그의 이벤트만 보낸다. 세션·화면·앱 수명 주기 자동 수집은 끈다.
  autocapture: false,
  // 광고·기기 식별자는 모으지 않는다. SDK가 만든 무작위 기기 ID만 웹과 함께 쓴다.
  trackingOptions: { adid: false, appSetId: false, idfv: false },
} satisfies Amplitude.Types.ReactNativeOptions;

export type TIdentityChange =
  { action: 'identify'; userId: string } | { action: 'switch'; userId: string } | { action: 'reset' };

/**
 * 웹의 auth.changed를 분석 사용자 식별로 옮긴다. 웹은 같은 로그인 상태를 여러 번 알릴 수 있는데(문서를 새로 열 때 등),
 * 식별된 사용자가 없는데도 reset하면 기기 ID가 매번 바뀐다. 그래서 바뀐 경우에만 동작을 돌려준다.
 */
export function resolveIdentityChange(
  currentUserId: string | undefined,
  { signedIn, userId }: TWebEventPayload<'auth.changed'>,
): TIdentityChange | null {
  if (!signedIn) return currentUserId ? { action: 'reset' } : null;
  if (!userId || userId === currentUserId) return null;
  // 로그아웃 알림 없이 다른 사용자로 바뀌었으면 이전 사용자와 기기 ID를 끊고 식별한다.
  return currentUserId ? { action: 'switch', userId } : { action: 'identify', userId };
}

interface ICreateAnalyticsOptions {
  /** 없으면 아무것도 보내지 않는다(개발·테스트 빌드). */
  apiKey: string | null;
  sdk: TAnalyticsSdk;
  startTimeoutMs?: number;
}

/** 분석 도구 오류가 로그인·공유·화면 흐름을 깨지 않게 한다. */
function safely(run: () => void) {
  try {
    run();
  } catch {
    // 분석은 보조 기능이라 실패해도 무시한다.
  }
}

/** Amplitude 연결. 판단만 하고 SDK는 주입받아 키가 없을 때 아무것도 하지 않는지 테스트한다. */
export function createAnalytics({ apiKey, sdk, startTimeoutMs = START_TIMEOUT_MS }: ICreateAnalyticsOptions) {
  let starting: Promise<string | null> | null = null;

  async function initialize(key: string) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), startTimeoutMs);
    });
    // 앱 시작이 이 결과를 기다리므로 SDK가 거부하거나 던져도 null로 끝낸다.
    const ready = Promise.resolve()
      .then(() => sdk.init(key, undefined, INIT_OPTIONS).promise)
      .then(() => {
        const deviceId = sdk.getDeviceId();
        return deviceId && deviceId.length <= MAX_DEVICE_ID_LENGTH ? deviceId : null;
      })
      .catch(() => null);
    try {
      return await Promise.race([ready, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    /** 한 번만 초기화하고 웹에 넘길 기기 ID를 돌려준다. 키가 없거나 실패·시간 초과면 null. 거부하지 않는다. */
    start: (): Promise<string | null> => {
      if (!apiKey) return Promise.resolve(null);
      starting ??= initialize(apiKey);
      return starting;
    },
    track: (event: TAnalyticsEvent) => {
      if (!apiKey) return;
      safely(() => {
        if ('properties' in event) {
          sdk.track(event.name, event.properties);
          return;
        }
        sdk.track(event.name);
      });
    },
    applyAuth: (payload: TWebEventPayload<'auth.changed'>) => {
      if (!apiKey) return;
      safely(() => {
        const change = resolveIdentityChange(sdk.getUserId(), payload);
        if (change?.action === 'reset' || change?.action === 'switch') sdk.reset();
        if (change?.action === 'identify' || change?.action === 'switch') sdk.setUserId(change.userId);
      });
    },
  };
}
