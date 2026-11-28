import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { withAccounts } from './store';

export const sessionCookie = 'deokdam.session';
export const flowCookie = 'deokdam.login-flow';
export const privateHeaders = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };

export function appOrigin(request: Request) {
  const configured = process.env.DEOKDAM_PUBLIC_ORIGIN?.trim();
  if (configured) return new URL(configured).origin;
  const host = request.headers.get('host');
  if (process.env.NODE_ENV !== 'production' && host && /^(localhost|127\.0\.0\.1):3460$/.test(host)) {
    return 'http://' + host;
  }
  return 'https://deokdam.bambyul.com';
}

export async function currentAccount() {
  const session = (await cookies()).get(sessionCookie)?.value;
  return session ? withAccounts((store) => store.account(session)) : null;
}

export function privateJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: privateHeaders });
}

export const cookieOptions = (origin: string, maxAge: number) => ({
  path: '/',
  httpOnly: true,
  secure: origin.startsWith('https:'),
  sameSite: 'lax' as const,
  maxAge,
});
