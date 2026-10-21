import { NextResponse, type NextRequest } from 'next/server';

import { match } from 'ts-pattern';

import { decideAuthGate } from '@/shared/lib/auth-gate.helper';

/**
 * 멤버 전용 화면에 세션 쿠키 없이 들어오면 `/?next=<원래 경로>`로 보낸다.
 * 쿠키는 있는지만 보고 값은 검증하거나 남기지 않는다(만료 여부는 API가 판단하고 화면이 로그인 패널로 안내한다).
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

// 초대(/invite/*)·홈·/backend/*·정적 파일은 건드리지 않는다. auth-gate.helper의 isMemberOnlyPath와 같은 범위다.
export const config = {
  matcher: ['/contests/:path*', '/me'],
};
