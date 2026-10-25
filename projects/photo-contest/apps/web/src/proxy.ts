import { NextResponse, type NextRequest } from 'next/server';

import { match } from 'ts-pattern';

import { decideAuthGate } from '@/shared/lib/auth-gate.helper';

/**
 * 익명·회원 세션이 없으면 `/sign?next=<원래 경로>`로 보낸다.
 * 쿠키는 존재만 확인하고, API에서 만료로 판정한 세션은 AuthSessionSync가 인증 화면으로 안내한다.
 */
export function proxy(request: NextRequest) {
  const decision = decideAuthGate({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    cookieHeader: request.headers.get('cookie'),
  });
  return match(decision)
    .with({ type: 'allow' }, () => NextResponse.next())
    .with({ type: 'redirect' }, ({ location }) => NextResponse.redirect(new URL(location, request.url)))
    .exhaustive();
}

// 인증·약관·OAuth 콜백·API·정적 파일을 제외한 콘텐츠 화면만 검사한다.
export const config = {
  matcher: [
    '/',
    '/explore',
    '/groups/:path*',
    '/invite/:path*',
    '/contests/:path*',
    '/me',
    '/notifications',
    '/onboarding',
  ],
};
