import type { Request } from 'express';
import { match } from 'ts-pattern';

import { AuthReturnPathSchema } from '@game-feedback/contracts';

import { cookies } from '../../common/http/cookies';
import { parse } from '../../common/validation';

export const OAUTH_RETURN_COOKIE = 'gamefeedback_oauth_return';

export function requestedReturnPath(req: Request) {
  return req.query.returnTo === undefined ? '/ko' : parse(AuthReturnPathSchema, req.query.returnTo);
}

export function savedReturnPath(req: Request) {
  const encoded = cookies(req)[OAUTH_RETURN_COOKIE];
  if (!encoded || encoded.length > 3000) return '/ko';
  const path = AuthReturnPathSchema.safeParse(Buffer.from(encoded, 'base64url').toString('utf8'));
  return path.success ? path.data : '/ko';
}

/** 인증 화면에서 시작했다면 그 화면이 받은 복귀 경로, 아니면 현재 경로로 돌아간다. */
function loginDestination(url: URL) {
  const locale = url.pathname.split('/')[1] ?? 'ko';
  const returnTo = /^\/(ko|en|ja)\/(login|onboarding)\/?$/.test(url.pathname)
    ? (url.searchParams.get('returnTo') ?? `/${locale}`)
    : `${url.pathname}${url.search}`;
  return { locale, returnTo };
}

export function loginRedirect(origin: string, path: string, state?: 'cancelled' | 'onboarding') {
  const parsed = AuthReturnPathSchema.safeParse(path);
  const url = new URL(parsed.success ? parsed.data : '/ko', origin);
  return match(state)
    .with('cancelled', () => {
      url.searchParams.set('login', 'cancelled');
      return url.toString();
    })
    .with('onboarding', () => {
      const { locale, returnTo } = loginDestination(url);
      const onboarding = new URL(`/${locale}/onboarding`, origin);
      onboarding.searchParams.set('returnTo', returnTo);
      return onboarding.toString();
    })
    .with(undefined, () => new URL(loginDestination(url).returnTo, origin).toString())
    .exhaustive();
}
