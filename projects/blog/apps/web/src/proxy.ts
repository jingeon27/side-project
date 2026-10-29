import { NextResponse, type NextRequest } from 'next/server';

import createMiddleware from 'next-intl/middleware';

import { routing } from './i18n/routing';

const internationalize = createMiddleware(routing);
export default function proxy(request: NextRequest) {
  // A literal percent sign is outside the public slug contract. Validate before
  // locale routing so malformed/recursive URL escapes cannot throw in decoding.
  try {
    if (decodeURI(request.nextUrl.pathname).includes('%'))
      return new NextResponse('Not found', { status: 404 });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
  return internationalize(request);
}

export const config = {
  matcher: ['/((?!api|rss|og|opengraph-image|_next|_vercel|.*\\..*).*)'],
};
