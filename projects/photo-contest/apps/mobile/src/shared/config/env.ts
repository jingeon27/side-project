import { buildAuthCallbackUrl } from './app-links';
import { resolveWebOrigin } from './web-origin';

export const WEB_ORIGIN = resolveWebOrigin(process.env.EXPO_PUBLIC_WEB_ORIGIN, __DEV__);
/** 로그인 밖의 딥링크(`photocontest://groups/1`)용. 소셜 로그인 코드는 이 스킴으로 받지 않는다. */
export const APP_SCHEME = 'photocontest';
/** 세션 쿠키가 웹 origin에 붙으므로 앱도 웹 origin의 `/backend/*` 프록시만 쓴다. */
export const API_BASE = `${WEB_ORIGIN}/backend`;
/** 소셜 로그인 코드를 받는 https 콜백. API MOBILE_AUTH_CALLBACK_URL과 같아야 한다. */
export const AUTH_CALLBACK_URL = buildAuthCallbackUrl(WEB_ORIGIN);
/** 업데이트 화면의 스토어 링크. 플랫폼별 빌드에서 넣고, 없으면 Android만 패키지 이름으로 만든다. */
export const STORE_URL = process.env.EXPO_PUBLIC_STORE_URL ?? null;

/** 빈 값은 설정하지 않은 것으로 본다. 키가 없는 개발·테스트 빌드는 아무것도 보내지 않는다. */
function readOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// Expo는 `process.env.EXPO_PUBLIC_*`를 그대로 쓴 곳만 빌드 때 값으로 바꾸므로 변수 이름을 직접 적는다.
export const SENTRY_DSN = readOptional(process.env.EXPO_PUBLIC_SENTRY_DSN);
export const AMPLITUDE_API_KEY = readOptional(process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY);
