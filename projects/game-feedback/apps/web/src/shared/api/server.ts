import 'server-only';
import { cookies } from 'next/headers';
const SESSION_COOKIE = 'gamefeedback_session';
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
  return { baseUrl: url.origin, signal: AbortSignal.timeout(10_000) };
}
export async function serverRequestOptions() {
  const session = (await cookies()).get(SESSION_COOKIE);
  return {
    ...publicServerOptions(),
    headers: session ? { Cookie: `${SESSION_COOKIE}=${session.value}` } : undefined,
  };
}
/** 세션 쿠키가 없으면 API 응답에 사용자별 차이(차단 관계 등)가 없어 공개 캐시를 쓸 수 있다. */
export async function hasSessionCookie() {
  return Boolean((await cookies()).get(SESSION_COOKIE));
}
