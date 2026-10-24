import type { TWebRequestPayload } from '@photo-contest/bridge';

export type TSocialProvider = TWebRequestPayload<'auth.socialLogin'>['provider'];

/** RFC 7636 권장값. 32바이트 난수를 base64url로 바꾸면 43자 verifier가 된다. */
export const PKCE_VERIFIER_BYTES = 32;

/** 콜백 주소를 origin(scheme·host·port)과 경로로 나눈다. */
const CALLBACK_URL_PARTS = /^(https?:\/\/[^\s/?#@]+)(\/[^\s?#]*)$/i;
/**
 * 서버가 붙이는 쿼리는 code 하나 또는 error 하나뿐이다. 다른 매개변수·중복·퍼센트 인코딩은 받지 않는다.
 * code는 브리지 결과 스키마(16~256자)보다 좁게 안전 문자만 받는다. 해시는 브라우저가 앞선 이동에서 이어 붙일 수 있어 무시한다.
 */
const CALLBACK_QUERY = /^\?(?:code=([A-Za-z0-9._~-]{16,256})|error=([a-z_]{1,64}))(?:#\S*)?$/;

export type TAuthCallback = { code: string } | { error: string };

/** 시스템 브라우저가 여는 주소. 세션 쿠키를 만들지 않고 앱 로그인 콜백으로 일회용 코드를 돌려받는다. */
export function buildSocialLoginUrl(apiBase: string, provider: TSocialProvider, challenge: string) {
  return `${apiBase}/auth/${provider}?app_challenge=${encodeURIComponent(challenge)}`;
}

/**
 * 인증 세션이 돌려준 콜백 URL에서 code 또는 error를 읽는다. scheme·host는 대소문자를 무시하고 경로는 정확히 같아야 한다.
 * React Native의 URL 구현이 불완전해 생성자 대신 정규식으로 읽는다. 콜백 주소가 아니거나 형식이 틀리면 null.
 */
export function readAuthCallback(url: string, callbackUrl: string): TAuthCallback | null {
  const [, origin, path] = callbackUrl.match(CALLBACK_URL_PARTS) ?? [];
  if (!origin || !path) return null;
  if (url.slice(0, origin.length).toLowerCase() !== origin.toLowerCase()) return null;
  const rest = url.slice(origin.length);
  if (rest.slice(0, path.length) !== path) return null;
  const [, code, error] = rest.slice(path.length).match(CALLBACK_QUERY) ?? [];
  if (code) return { code };
  return error ? { error } : null;
}
