import dayjs from 'dayjs';

import { SocialProviderSchema, type TSocialProvider } from '@game-feedback/contracts';

import { ANALYTICS_EVENT, type TAnalyticsProperties } from './analytics.catalog';
import { trackEvent } from './analytics.store';

const KEY = 'gf:pending-login';
export const LOGIN_MARKER_TTL = 30 * 60 * 1000;
interface ILoginMarker {
  provider: TSocialProvider;
  at: number;
  onboarding: boolean;
}
function read(now = dayjs().valueOf()): ILoginMarker | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    if (!value || typeof value !== 'object' || !('provider' in value) || !('at' in value)) return null;
    const provider = SocialProviderSchema.safeParse(value.provider);
    if (
      !provider.success ||
      typeof value.at !== 'number' ||
      !Number.isFinite(value.at) ||
      now - value.at < 0 ||
      now - value.at > LOGIN_MARKER_TTL
    ) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return {
      provider: provider.data,
      at: value.at,
      onboarding: 'onboarding' in value && value.onboarding === true,
    };
  } catch {
    return null;
  }
}
export function savePendingLogin(provider: TSocialProvider, now = dayjs().valueOf()) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ provider, at: now, onboarding: false }));
  } catch {
    /* 저장소 차단이 로그인을 막지 않게 한다. */
  }
}
export function markPendingOnboarding() {
  const marker = read();
  if (!marker) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...marker, onboarding: true }));
  } catch {
    /* 분석 없이 가입을 계속한다. */
  }
}
export function consumePendingLogin(now = dayjs().valueOf()) {
  const marker = read(now);
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* 일시 저장소가 막힌 환경이다. */
  }
  return marker;
}
/** 이 탭에서 시작한 로그인의 실패만 한 번 집계한다. 표시를 소비하므로 새로고침은 다시 세지 않는다. */
export function trackLoginFailure(reason: TAnalyticsProperties['login_failed']['reason']) {
  const marker = consumePendingLogin();
  if (marker) trackEvent(ANALYTICS_EVENT.LoginFailed, { provider: marker.provider, reason });
}
