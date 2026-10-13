import type { TWebRequestPayload } from '@photo-contest/bridge';

export type TSocialProvider = TWebRequestPayload<'auth.socialLogin'>['provider'];

/** RFC 7636 권장값. 32바이트 난수를 base64url로 바꾸면 43자 verifier가 된다. */
export const PKCE_VERIFIER_BYTES = 32;

/** 앱 로그인 교환 코드 형식. 브리지 결과 스키마(16~256자)보다 좁게 안전 문자만 받는다. */
const LOGIN_CODE = /^[A-Za-z0-9._~-]{16,256}$/;

export type TAuthCallback = { code: string } | { error: string };

/** 시스템 브라우저가 여는 주소. 세션 쿠키를 만들지 않고 앱 콜백으로 일회용 코드를 돌려받는다. */
export function buildSocialLoginUrl(apiBase: string, provider: TSocialProvider, challenge: string) {
  return `${apiBase}/auth/${provider}?app_challenge=${encodeURIComponent(challenge)}`;
}

export function buildAuthCallbackUrl(appScheme: string) {
  return `${appScheme}://auth/callback`;
}

function readQueryParam(query: string, name: string) {
  const match = query.match(new RegExp(`(?:^|&)${name}=([^&]*)`));
  if (match?.[1] === undefined) return null;
  try {
    return decodeURIComponent(match[1].replace(/\+/g, ' '));
  } catch {
    return null;
  }
}

/**
 * 인증 세션이 돌려준 콜백 URL에서 code 또는 error를 읽는다.
 * React Native의 URL 구현이 불완전해 생성자 대신 정규식으로 읽는다. 콜백 주소가 아니거나 형식이 틀리면 null.
 */
export function readAuthCallback(url: string, callbackUrl: string): TAuthCallback | null {
  if (url.slice(0, callbackUrl.length).toLowerCase() !== callbackUrl.toLowerCase()) return null;
  const rest = url.slice(callbackUrl.length);
  if (!rest.startsWith('?')) return null;
  const query = rest.slice(1).split('#', 1)[0] ?? '';
  const error = readQueryParam(query, 'error');
  if (error !== null) return { error };
  const code = readQueryParam(query, 'code');
  return code !== null && LOGIN_CODE.test(code) ? { code } : null;
}
