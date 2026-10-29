import 'server-only';

import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

import { cookies, headers } from 'next/headers';

import { readRuntimeSecret } from '../config/runtime-secret.server';

const SESSION_COOKIE = 'gamefeedback_session';
const INTERNAL_CLIENT = 'internal';

function apiOptions() {
  const url = new URL(process.env.GAME_FEEDBACK_API_URL || 'http://127.0.0.1:4300');
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Game Feedback API origin is invalid.');
  return { baseUrl: url.origin, signal: AbortSignal.timeout(10_000) };
}
/**
 * Next aborts on `Date.now()` while prerendering, including the runtime stages tracked by
 * `partialPrefetching` where this runs after cookies()/headers() resolve. `connection()` is not an option
 * because `serviceContext`'s `'use cache: private'` scope also reaches here. The timestamp is never
 * rendered, so read the wall clock through `performance`, which Next documents as unguarded.
 */
function epochMilliseconds() {
  return performance.timeOrigin + performance.now();
}
/**
 * The API sees this server's address on every call, so SSR would share one rate-limit budget. Sign the
 * visitor address (or `internal`) with a key derived from the secret both servers already share.
 * `apps/api/src/common/http/forwarded-client.ts` verifies the same derivation within a 60-second window.
 */
export function forwardedClientHeaders(client: string, now = epochMilliseconds()): Record<string, string> {
  const secret = readRuntimeSecret();
  if (!secret || secret.length < 32) return {};
  const key = createHmac('sha256', secret).update('game-feedback:forwarded-client:v1').digest();
  const timestamp = String(Math.floor(now / 1000));
  return {
    'x-gf-client-ip': client,
    'x-gf-client-timestamp': timestamp,
    'x-gf-client-signature': createHmac('sha256', key).update(`${timestamp}\n${client}`).digest('base64url'),
  };
}
/** Cookie-free reads shared by every visitor (cached public data, sitemap) use the API's internal budget. */
export function publicServerOptions() {
  return { ...apiOptions(), headers: forwardedClientHeaders(INTERNAL_CLIENT) };
}
/**
 * Proxy access checks run once per visitor request (unlike the shared `'use cache'` fills), so they spend the
 * visitor's own API budget. Without a forwarded address (local development) they keep the internal budget.
 */
export function visitorLookupOptions(visitor: string | null) {
  return { ...apiOptions(), headers: forwardedClientHeaders(visitor ?? INTERNAL_CLIENT) };
}
// Caddy replaces any X-Forwarded-For sent by the client, so its first value is the visitor address.
export function visitorAddress(forwardedFor: string | null) {
  const address = forwardedFor?.split(',')[0]?.trim() ?? '';
  return isIP(address) ? address : null;
}
export async function serverRequestOptions() {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const session = cookieStore.get(SESSION_COOKIE);
  const visitor = visitorAddress(requestHeaders.get('x-forwarded-for'));
  return {
    ...apiOptions(),
    headers: {
      ...(visitor ? forwardedClientHeaders(visitor) : {}),
      ...(session ? { Cookie: `${SESSION_COOKIE}=${session.value}` } : {}),
    },
  };
}
/** 세션 쿠키가 없으면 API 응답에 사용자별 차이(차단 관계 등)가 없어 공개 캐시를 쓸 수 있다. */
export async function hasSessionCookie() {
  return Boolean((await cookies()).get(SESSION_COOKIE));
}
