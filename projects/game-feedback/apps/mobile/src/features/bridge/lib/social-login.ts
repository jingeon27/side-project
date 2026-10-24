import { buildAppAuthCallbackUrl, type TLoginProvider, type TLoginResult } from '@game-feedback/bridge';

/** 콜백 주소를 origin(scheme·host·port)과 경로로 나눈다. */
const CALLBACK_URL_PARTS = /^(https?:\/\/[^\s/?#@]+)(\/[^\s?#]*)$/i;
/** 서버가 붙이는 쿼리는 43자 code 하나뿐이다. 해시는 브라우저가 앞선 이동에서 이어 붙일 수 있어 무시한다. */
const CALLBACK_QUERY = /^\?code=([A-Za-z0-9_-]{43})(?:#\S*)?$/;

/**
 * 인증 세션이 돌려준 URL이 웹 origin의 https 앱 로그인 콜백일 때만 성공이다.
 * scheme·host·port는 대소문자를 무시하고 경로는 정확히 같아야 한다. 다른 query·`error=`·커스텀 스킴은 실패다.
 */
export function parseLoginCallback(url: string, verifier: string, callbackUrl: string): TLoginResult {
  const [, origin, path] = CALLBACK_URL_PARTS.exec(callbackUrl) ?? [];
  if (!origin || !path || url.slice(0, origin.length).toLowerCase() !== origin.toLowerCase())
    return { status: 'failed' };
  const rest = url.slice(origin.length);
  if (rest.slice(0, path.length) !== path) return { status: 'failed' };
  const code = CALLBACK_QUERY.exec(rest.slice(path.length))?.[1];
  return code ? { status: 'success', code, verifier } : { status: 'failed' };
}
interface ILoginPlatform {
  randomVerifier: () => string;
  challenge: (verifier: string) => Promise<string>;
  /** redirect는 검증된 https 앱 링크다. 같은 스킴을 등록한 다른 앱이 코드를 받지 못한다. */
  openSession: (url: string, callback: string) => Promise<{ type: string; url?: string }>;
}
export async function socialLogin(
  origin: string,
  platform: ILoginPlatform,
  provider: TLoginProvider = 'google',
): Promise<TLoginResult> {
  const verifier = platform.randomVerifier();
  const challenge = await platform.challenge(verifier);
  const callbackUrl = buildAppAuthCallbackUrl(origin);
  const result = await platform.openSession(
    `${origin}/api/auth/social/${provider}?app_challenge=${challenge}`,
    callbackUrl,
  );
  if (result.type === 'cancel' || result.type === 'dismiss') return { status: 'cancelled' };
  if (result.type !== 'success' || !result.url) return { status: 'failed' };
  return parseLoginCallback(result.url, verifier, callbackUrl);
}
