import { z } from 'zod';

export const localTestAccounts = ['A', 'B'] as const;
export const localAccountSchema = z.enum(localTestAccounts);

export function loopbackOrigin(headers: Pick<Headers, 'get'>) {
  const host = headers.get('host') ?? '';
  return /^(?:localhost|127\.0\.0\.1):346[01]$/.test(host) ? 'http://' + host : undefined;
}

export function localLoginEnabled(
  headers: Pick<Headers, 'get'>,
  mode = process.env.NODE_ENV,
  flag = process.env.DEOKDAM_LOCAL_LOGIN,
) {
  if (mode !== 'development' || flag !== '1') return false;
  const host = headers.get('host') ?? '';
  if (!loopbackOrigin(headers)) return false;
  const forwardedHost = headers.get('x-forwarded-host');
  const protocol = headers.get('x-forwarded-proto');
  const forwardedFor = headers.get('x-forwarded-for');
  return (
    (!forwardedHost || forwardedHost === host) &&
    (!protocol || protocol === 'http') &&
    !headers.get('forwarded') &&
    (!forwardedFor || ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(forwardedFor))
  );
}
