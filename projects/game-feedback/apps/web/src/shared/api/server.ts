import 'server-only';
import { cookies } from 'next/headers';
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
  const session = (await cookies()).get('gamefeedback_session');
  return {
    ...publicServerOptions(),
    headers: session ? { Cookie: `gamefeedback_session=${session.value}` } : undefined,
  };
}
