import { NextResponse, type NextRequest } from 'next/server';

import { loginPath, providerSchema, returnPath } from '@/features/account/navigation';
import { authorizationUrl, oauthConfig } from '@/features/account/oauth';
import {
  appOrigin,
  cookieOptions,
  flowCookie,
  privateHeaders,
  privateJson,
} from '@/features/account/session';
import { flowSeconds, withAccounts } from '@/features/account/store';

export async function POST(request: NextRequest, { params }: RouteContext<'/api/auth/[provider]'>) {
  const provider = providerSchema.safeParse((await params).provider);
  if (!provider.success) return privateJson({ error: 'provider' }, 404);
  const origin = appOrigin(request);
  if (request.headers.get('origin') !== origin) return privateJson({ error: 'origin' }, 403);
  const form = await request.formData();
  const next = returnPath(form.get('next'));
  const config = oauthConfig(provider.data);
  if (!config)
    return NextResponse.redirect(new URL(loginPath(next) + '&error=unavailable', origin), {
      status: 303,
      headers: privateHeaders,
    });
  const flow = withAccounts((store) => store.begin(provider.data, next));
  const url = authorizationUrl(
    provider.data,
    config.id,
    origin + '/api/auth/' + provider.data + '/callback',
    flow,
  );
  const response = NextResponse.redirect(url, { status: 303, headers: privateHeaders });
  response.cookies.set(flowCookie, flow.binding, cookieOptions(origin, flowSeconds));
  return response;
}
