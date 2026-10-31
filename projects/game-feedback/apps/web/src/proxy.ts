import { NextResponse, type NextRequest } from 'next/server';

import { resolveAppRoute } from '@game-feedback/bridge';

import { documentUnavailable } from '@/_app/seo/index.server';
import { visitorAddress } from '@/shared/api/server';
import { PUBLIC_LOOKUP_PAGES_PER_MINUTE, VisitorRateLimiter } from '@/shared/api/visitor-rate-limit';
import { isLocale, LANGUAGE_COOKIE, LOCALE_HEADER, preferredLocale } from '@/shared/i18n/index.server';

// 상세 문서·RSC 요청은 URL의 id로 공유 캐시를 채운다. 캐시 안의 API 호출은 방문자를 알 수 없어 내부 예산을
// 쓰므로, 캐시에 닿기 전에 방문자 주소(Caddy가 덮어쓴 X-Forwarded-For 첫 값)마다 제한한다. 주소가 없는
// 로컬 직접 요청은 제한하지 않는다.
const LOOKUP_PAGE = /^\/(?:ko|en|ja)\/(?:posts|users)\/[^/]+$/;
const lookupPages = new VisitorRateLimiter(PUBLIC_LOOKUP_PAGES_PER_MINUTE);

function publicRequestUrl(request: NextRequest) {
  const url = new URL(request.url);
  const host = request.headers.get('host');
  if (host) {
    // URL.host는 포트 없는 호스트를 대입해도 기존 내부 포트를 유지한다.
    // 먼저 지운 뒤 공개 Host에 명시된 포트만 반영한다.
    url.port = '';
    url.host = host;
  }
  return url;
}

function tooManyRequests(retryAfter: number) {
  return new NextResponse('Too Many Requests', {
    status: 429,
    headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'private, no-store' },
  });
}

export async function proxy(request: NextRequest) {
  if (/^\/api\/admin(?:\/|$)/i.test(request.nextUrl.pathname))
    return new NextResponse('Not Found', { status: 404 });
  const candidate = request.nextUrl.pathname.split('/')[1];
  const locale = isLocale(candidate)
    ? candidate
    : preferredLocale(request.cookies.get(LANGUAGE_COOKIE)?.value, request.headers.get('accept-language'));
  if (request.nextUrl.pathname === '/') {
    const url = publicRequestUrl(request);
    url.pathname = `/${locale}`;
    for (const key of [...url.searchParams.keys()])
      if (!['q', 'tab'].includes(key)) url.searchParams.delete(key);
    return NextResponse.redirect(url);
  }
  if (/^\/(ko|en|ja)\/admin(?:\/|$)/.test(request.nextUrl.pathname))
    return new NextResponse('Not Found', { status: 404 });
  const visitor = visitorAddress(request.headers.get('x-forwarded-for'));
  const invalidBoardContext =
    /^\/(?:ko|en|ja)\/(?:boards(?:\/[^/]+)?|write|search)\/?$/.test(request.nextUrl.pathname) &&
    !resolveAppRoute(request.nextUrl.pathname + request.nextUrl.search);
  if (visitor && LOOKUP_PAGE.test(request.nextUrl.pathname)) {
    const retryAfter = lookupPages.consume(visitor);
    if (retryAfter) return tooManyRequests(retryAfter);
  }
  if (
    request.method === 'GET' &&
    (invalidBoardContext ||
      (request.headers.get('rsc') !== '1' &&
        (await documentUnavailable(
          request.nextUrl.pathname,
          request.cookies.get('gamefeedback_session')?.value,
          request.nextUrl.searchParams.getAll('game'),
          visitor,
        ))))
  ) {
    const url = publicRequestUrl(request);
    url.pathname = '/unavailable';
    url.search = '';
    const response = NextResponse.rewrite(url, { status: 404 });
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, locale);
  requestHeaders.set('x-game-feedback-navigation', request.headers.get('rsc') === '1' ? '1' : '0');
  return NextResponse.next({ request: { headers: requestHeaders } });
}
export const config = { matcher: ['/api/admin/:path*', '/', '/ko/:path*', '/en/:path*', '/ja/:path*'] };
