import { getDeviceId, getUserId, init, reset, setUserId, track } from '@amplitude/analytics-react-native';

import { AMPLITUDE_API_KEY } from '@/shared/config/env';

import { createAnalytics } from '../lib/create-analytics';

/** 초기화는 한 번만 실행하며 키가 없으면 이벤트·사용자 동기화를 건너뛴다. */
export const {
  start: startAnalytics,
  track: trackEvent,
  applyAuth: applyAnalyticsAuth,
} = createAnalytics({
  apiKey: AMPLITUDE_API_KEY,
  sdk: { init, track, getDeviceId, getUserId, setUserId, reset },
});
