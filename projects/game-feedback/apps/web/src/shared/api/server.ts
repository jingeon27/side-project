import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { cookies, headers } from 'next/headers';
const SESSION_COOKIE = 'gamefeedback_session';
const PROXY_SECRET_HEADER = 'x-game-feedback-proxy-secret';
const CLIENT_IP_HEADER = 'x-game-feedback-client-ip';

function proxySecret() {
  const secret = process.env.GF_PROXY_SECRET;
  if (secret && !/^[a-f0-9]{64}$/i.test(secret))
    throw new Error('GF_PROXY_SECRET must contain 64 hex characters.');
  return secret;
}

/** Only Caddy-authenticated visitor identity may cross the direct Web -> API hop. */
export function serverRequestHeaders(source: Headers, session?: string) {
  const secret = proxySecret();
  const supplied = source.get(PROXY_SECRET_HEADER);
  const ip = source.get(CLIENT_IP_HEADER);
  const trusted = Boolean(
    secret &&
    supplied &&
    ip &&
    isIP(ip) &&
    Buffer.byteLength(secret) === Buffer.byteLength(supplied) &&
    timingSafeEqual(Buffer.from(secret), Buffer.from(supplied)),
  );
  const forwarded: Record<string, string> = {};
  if (trusted && secret && ip) {
    forwarded[PROXY_SECRET_HEADER] = secret;
    forwarded[CLIENT_IP_HEADER] = ip;
  }
  if (session) forwarded.Cookie = `${SESSION_COOKIE}=${session}`;
  return Object.keys(forwarded).length ? forwarded : undefined;
}

export function publicServerOptions() {
  const url = new URL(process.env.GAME_FEEDBACK_API_URL || process.env.API_ORIGIN || 'http://127.0.0.1:4300');
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Game Feedback API origin is invalid.');
  const secret = proxySecret();
  return {
    baseUrl: url.origin,
    signal: AbortSignal.timeout(10_000),
    ...(secret ? { headers: { [PROXY_SECRET_HEADER]: secret } } : {}),
  };
}
export async function serverRequestOptions() {
  const session = (await cookies()).get(SESSION_COOKIE);
  return {
    ...publicServerOptions(),
    headers: serverRequestHeaders(await headers(), session?.value),
  };
}
/** 세션 쿠키가 없으면 API 응답에 사용자별 차이(차단 관계 등)가 없어 공개 캐시를 쓸 수 있다. */
export async function hasSessionCookie() {
  return Boolean((await cookies()).get(SESSION_COOKIE));
}
