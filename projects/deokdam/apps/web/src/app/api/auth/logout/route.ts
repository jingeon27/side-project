import { NextResponse, type NextRequest } from 'next/server';

import {
  appOrigin,
  cookieOptions,
  flowCookie,
  privateHeaders,
  privateJson,
  sessionCookie,
} from '@/features/account/session';
import { withAccounts } from '@/features/account/store';

export async function POST(request: NextRequest) {
  const origin = appOrigin(request);
  if (request.headers.get('origin') !== origin) return privateJson({ error: 'origin' }, 403);
  const token = request.cookies.get(sessionCookie)?.value;
  if (token) withAccounts((store) => store.signOut(token));
  const response = NextResponse.redirect(new URL('/journal', origin), {
    status: 303,
    headers: privateHeaders,
  });
  for (const name of [sessionCookie, flowCookie, 'deokdam.login-result'])
    response.cookies.set(name, '', cookieOptions(origin, 0));
  return response;
}
