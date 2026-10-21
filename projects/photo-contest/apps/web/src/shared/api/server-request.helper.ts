const DEFAULT_API_URL = 'http://127.0.0.1:4200';
const DEFAULT_WEB_ORIGIN = 'http://localhost:3200';

/** 서버(RSC)에서 API를 직접 부를 주소. 브라우저는 같은 origin의 `/backend` 프록시를 쓴다. */
export function getServerApiUrl(env: Record<string, string | undefined> = process.env) {
  return (env.API_URL || DEFAULT_API_URL).replace(/\/+$/, '');
}

/** API가 상태를 바꾸는 요청(POST)에서 확인하는 웹 origin */
export function getWebOrigin(env: Record<string, string | undefined> = process.env) {
  return new URL(
    env.WEB_ORIGIN || (env.NODE_ENV === 'production' ? 'https://contest.bambyul.com' : DEFAULT_WEB_ORIGIN),
  ).origin;
}

/**
 * RSC에서 API로 보내는 요청 헤더. 들어온 요청의 Cookie 헤더 원문을 그대로 넘기고(값을 해석하거나 남기지 않는다),
 * GraphQL POST가 API의 Origin 검사와 CSRF 방지를 통과하도록 웹 origin과 preflight 헤더를 붙인다.
 */
export function buildServerRequestHeaders(
  init: HeadersInit | undefined,
  { cookie, webOrigin }: { cookie: string | null; webOrigin: string },
) {
  const headers = new Headers(init);
  if (cookie) headers.set('cookie', cookie);
  if (!cookie) headers.delete('cookie');
  headers.set('origin', webOrigin);
  headers.set('apollo-require-preflight', 'true');
  return headers;
}
