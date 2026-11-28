import { NextResponse, type NextRequest } from 'next/server';

import { loginPath, providerSchema } from '@/features/account/navigation';
import { exchangeIdentity, oauthConfig } from '@/features/account/oauth';
import {
  appOrigin,
  cookieOptions,
  flowCookie,
  privateHeaders,
  privateJson,
  sessionCookie,
} from '@/features/account/session';
import { sessionSeconds, withAccounts } from '@/features/account/store';

export async function GET(request: NextRequest, { params }: RouteContext<'/api/auth/[provider]/callback'>) {
  const provider = providerSchema.safeParse((await params).provider);
  if (!provider.success) return privateJson({ error: 'provider' }, 404);
  const origin = appOrigin(request);
  const query = request.nextUrl.searchParams;
  const state = query.get('state');
  const binding = request.cookies.get(flowCookie)?.value;
  const flow = binding && state && withAccounts((store) => store.consume(provider.data, state, binding));
  const redirect = (path: string) =>
    NextResponse.redirect(new URL(path, origin), { status: 303, headers: privateHeaders });
  if (!flow) return redirect(loginPath('/journal') + '&error=expired');
  const code = query.get('code');
  const config = oauthConfig(provider.data);
  const failed = (reason: string) => {
    const response = redirect(loginPath(flow.next) + '&error=' + reason);
    response.cookies.set(flowCookie, '', cookieOptions(origin, 0));
    return response;
  };
  if (!code || !config || query.has('error'))
    return failed(query.get('error') === 'access_denied' ? 'cancelled' : 'expired');
  try {
    const subject = await exchangeIdentity(
      provider.data,
      config,
      origin + '/api/auth/' + provider.data + '/callback',
      code,
      flow,
    );
    const oldSession = request.cookies.get(sessionCookie)?.value;
    const account = withAccounts((store) => {
      const account = store.signIn(provider.data, subject);
      if (oldSession) store.signOut(oldSession);
      return account;
    });
    const response = redirect(flow.next);
    response.cookies.set(sessionCookie, account.session, cookieOptions(origin, sessionSeconds));
    response.cookies.set(flowCookie, '', cookieOptions(origin, 0));
    response.cookies.set('deokdam.login-result', provider.data, {
      ...cookieOptions(origin, 60),
      httpOnly: false,
    });
    return response;
  } catch {
    return failed('failed');
  }
}
