import { getDeviceId, getUserId, init, reset, setUserId, track } from '@amplitude/analytics-react-native';

import type { TWebEventPayload } from '@photo-contest/bridge';

import { AMPLITUDE_API_KEY } from '@/shared/config/env';

import type { TAnalyticsEvent } from '../config/events';
import { createAnalytics } from '../lib/create-analytics';

const analytics = createAnalytics({
  apiKey: AMPLITUDE_API_KEY,
  sdk: { init, track, getDeviceId, getUserId, setUserId, reset },
});

/** 앱을 시작할 때 부른다. 여러 번 불러도 한 번만 초기화하고, 웹에 넘길 기기 ID(없으면 null)를 돌려준다. */
export function startAnalytics() {
  return analytics.start();
}

/** EXPO_PUBLIC_AMPLITUDE_API_KEY가 없으면 아무것도 보내지 않는다. */
export function trackEvent(event: TAnalyticsEvent) {
  analytics.track(event);
}

/** 웹 로그인 상태(auth.changed)에 분석 사용자를 맞춘다. 세션 자체는 WebView 쿠키가 맡는다. */
export function applyAnalyticsAuth(payload: TWebEventPayload<'auth.changed'>) {
  analytics.applyAuth(payload);
}
