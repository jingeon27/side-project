import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

import { loopbackOrigin } from './local-login';
import type { TAccountProvider } from './navigation';
import { sessionSeconds, withAccounts } from './store';

export const sessionCookie = 'deokdam.session';
export const flowCookie = 'deokdam.login-flow';
export const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, noarchive',
};

export function appOrigin(request: Request) {
  const local = process.env.NODE_ENV === 'development' && loopbackOrigin(request.headers);
  if (local) return local;
  const configured = process.env.DEOKDAM_PUBLIC_ORIGIN?.trim();
  if (configured) return new URL(configured).origin;
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

export function signedInResponse(
  request: NextRequest,
  origin: string,
  next: string,
  provider: TAccountProvider,
  subject: string,
) {
  const previous = request.cookies.get(sessionCookie)?.value;
  const account = withAccounts((store) => {
    const issued = store.signIn(provider, subject);
    if (previous) store.signOut(previous);
    return issued;
  });
  const response = NextResponse.redirect(new URL(next, origin), { status: 303, headers: privateHeaders });
  response.cookies.set(sessionCookie, account.session, cookieOptions(origin, sessionSeconds));
  response.cookies.set(flowCookie, '', cookieOptions(origin, 0));
  response.cookies.set('deokdam.login-result', provider, { ...cookieOptions(origin, 60), httpOnly: false });
  return response;
}
