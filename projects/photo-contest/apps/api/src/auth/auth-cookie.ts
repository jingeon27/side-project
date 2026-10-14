import type { CookieOptions } from 'express';

import { isProduction } from '../config/env';

export const AUTH_COOKIE = {
  SESSION: 'contest_session',
  OAUTH_STATE: 'contest_oauth_state',
} as const;

/** 스크립트에서 읽을 수 없고, 다른 사이트에서 시작한 POST에는 실리지 않는 쿠키 */
export function authCookieOptions(maxAgeMs?: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    ...(maxAgeMs === undefined ? {} : { maxAge: maxAgeMs }),
  };
}
