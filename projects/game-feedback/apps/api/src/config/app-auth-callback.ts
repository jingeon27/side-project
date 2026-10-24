/**
 * 앱 로그인 일회용 코드를 받는 웹 경로. 웹 안내 페이지와 AASA·assetlinks, 앱 associated domains·intent filter,
 * bridge `APP_AUTH_CALLBACK_PATH`와 같은 값이다. 검증된 App Link·Universal Link만 이 경로를 앱으로 넘기므로
 * 같은 커스텀 스킴을 등록한 다른 앱이 자기 challenge로 시작한 흐름의 코드를 가로채지 못한다.
 */
export const APP_AUTH_CALLBACK_PATH = '/app-auth/callback';

/** WEB_ORIGIN의 앱 로그인 콜백 경로와 정확히 같은 URL만 받는다(쿼리·해시·계정 정보 없음). 아니면 null. */
export function parseAppAuthCallbackUrl(value: string | undefined, webOrigin: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const exact =
      url.origin === webOrigin &&
      url.pathname === APP_AUTH_CALLBACK_PATH &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password;
    return exact ? `${url.origin}${url.pathname}` : null;
  } catch {
    return null;
  }
}

/**
 * 앱 로그인 코드를 보낼 콜백 URL. 커스텀 스킴으로는 보내지 않는다.
 * 운영은 `MOBILE_AUTH_CALLBACK_URL`이 WEB_ORIGIN의 콜백 경로가 아니면 시작을 멈추고, 개발·테스트는 기본값을 쓴다.
 */
export function resolveAppAuthCallbackUrl(value: string | undefined, webOrigin: string, production: boolean) {
  const configured = parseAppAuthCallbackUrl(value, webOrigin);
  if (configured) return configured;
  if (production)
    throw new Error(
      `Production requires MOBILE_AUTH_CALLBACK_URL=${webOrigin}${APP_AUTH_CALLBACK_PATH} (same origin as WEB_ORIGIN).`,
    );
  return `${webOrigin}${APP_AUTH_CALLBACK_PATH}`;
}
