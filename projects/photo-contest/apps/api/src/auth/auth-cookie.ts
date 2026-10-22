import type { CookieOptions } from 'express';

import { isProduction } from '../config/env';

const COOKIE_NAME = {
  SESSION: 'contest_session',
  OAUTH_STATE: 'contest_oauth_state',
} as const;

// 브라우저는 Secure·Path=/·Domain 없음인 쿠키에만 __Host- 이름을 허용한다.
// 형제 서브도메인이 같은 이름의 쿠키를 심어 세션을 바꿔치기하지 못한다. 개발 http에서는 Secure를 못 쓰므로 붙이지 않는다.
const HOST_PREFIX = '__Host-';

function cookieName(name: string) {
  return isProduction() ? `${HOST_PREFIX}${name}` : name;
}

/** 세션 쿠키 이름. 운영(https)은 `__Host-contest_session`, 개발·테스트(http)는 `contest_session` */
export function sessionCookieName() {
  return cookieName(COOKIE_NAME.SESSION);
}

/** OAuth state 쿠키 이름. 세션 쿠키와 같은 원칙을 따른다. */
export function oauthStateCookieName() {
  return cookieName(COOKIE_NAME.OAUTH_STATE);
}

/** 스크립트에서 읽을 수 없고, 다른 사이트에서 시작한 POST에는 실리지 않는 쿠키. Domain은 두지 않는다. */
export function authCookieOptions(maxAgeMs?: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    ...(maxAgeMs === undefined ? {} : { maxAge: maxAgeMs }),
  };
}
