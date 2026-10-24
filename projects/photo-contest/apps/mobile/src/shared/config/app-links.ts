/**
 * 소셜 로그인 콜백 경로. app.config.ts의 associated domains·intent filter, 웹 안내 페이지와 AASA·assetlinks,
 * API의 MOBILE_AUTH_CALLBACK_URL과 같은 값이다. 검증된 App Link·Universal Link만 이 주소를 이 앱으로 넘긴다.
 */
export const AUTH_CALLBACK_PATH = '/app-auth/callback';

/** 예: https://contest.example → https://contest.example/app-auth/callback */
export function buildAuthCallbackUrl(webOrigin: string) {
  return `${webOrigin}${AUTH_CALLBACK_PATH}`;
}
