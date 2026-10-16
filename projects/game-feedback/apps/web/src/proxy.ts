import { NextResponse, type NextRequest } from 'next/server';
import { isLocale, preferredLocale, LANGUAGE_COOKIE, LOCALE_HEADER } from '@/shared/i18n/index.server';

export function proxy(request: NextRequest) {
  const candidate = request.nextUrl.pathname.split('/')[1];
  const locale = isLocale(candidate)
    ? candidate
    : preferredLocale(request.cookies.get(LANGUAGE_COOKIE)?.value, request.headers.get('accept-language'));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, locale);
  return NextResponse.next({ request: { headers: requestHeaders } });
}
export const config = { matcher: ['/', '/ko/:path*', '/en/:path*', '/ja/:path*'] };
