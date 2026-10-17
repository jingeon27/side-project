import { documentUnavailable } from '@/_app/seo/index.server';
import { NextResponse, type NextRequest } from 'next/server';
import { isLocale, preferredLocale, LANGUAGE_COOKIE, LOCALE_HEADER } from '@/shared/i18n/index.server';

export async function proxy(request: NextRequest) {
  const candidate = request.nextUrl.pathname.split('/')[1];
  const locale = isLocale(candidate)
    ? candidate
    : preferredLocale(request.cookies.get(LANGUAGE_COOKIE)?.value, request.headers.get('accept-language'));
  if (request.nextUrl.pathname === '/') {
    const url = new URL(request.url);
    url.host = request.headers.get('host') ?? url.host;
    url.pathname = `/${locale}`;
    for (const key of [...url.searchParams.keys()])
      if (!['q', 'tab'].includes(key)) url.searchParams.delete(key);
    return NextResponse.redirect(url);
  }
  if (
    /^\/(ko|en|ja)\/admin(?:\/|$)/.test(request.nextUrl.pathname) &&
    (process.env.NODE_ENV === 'production' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(request.nextUrl.hostname))
  )
    return new NextResponse('Not Found', { status: 404 });
  if (
    request.method === 'GET' &&
    request.headers.get('rsc') !== '1' &&
    (await documentUnavailable(
      request.nextUrl.pathname,
      request.cookies.get('gamefeedback_session')?.value,
      request.nextUrl.searchParams.getAll('game'),
    ))
  ) {
    const url = new URL(request.url);
    url.host = request.headers.get('host') ?? url.host;
    url.pathname = `/${locale}/unavailable`;
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
export const config = { matcher: ['/', '/ko/:path*', '/en/:path*', '/ja/:path*'] };
