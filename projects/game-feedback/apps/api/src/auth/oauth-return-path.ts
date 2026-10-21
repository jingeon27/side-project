import type { Request } from 'express';

import { AuthReturnPathSchema } from '@game-feedback/contracts';

import { cookies } from '../common/http/cookies';
import { parse } from '../common/validation';

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

export function loginRedirect(origin: string, path: string, state?: 'cancelled' | 'onboarding') {
  const parsed = AuthReturnPathSchema.safeParse(path);
  const url = new URL(parsed.success ? parsed.data : '/ko', origin);
  if (state === 'cancelled') {
    url.searchParams.set('login', 'cancelled');
    return url.toString();
  }
  const locale = url.pathname.split('/')[1] ?? 'ko';
  const returnTo = /^\/(ko|en|ja)\/(login|onboarding)\/?$/.test(url.pathname)
    ? (url.searchParams.get('returnTo') ?? `/${locale}`)
    : `${url.pathname}${url.search}`;
  if (state === 'onboarding') {
    const onboarding = new URL(`/${locale}/onboarding`, origin);
    onboarding.searchParams.set('returnTo', returnTo);
    return onboarding.toString();
  }
  return new URL(returnTo, origin).toString();
}
