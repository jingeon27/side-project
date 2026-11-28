import { NextResponse, type NextRequest } from 'next/server';

import { z } from 'zod';

import {
  appOrigin,
  cookieOptions,
  currentAccount,
  privateHeaders,
  privateJson,
} from '@/features/account/session';
import { legacyOrderCookie } from '@/features/shop/http';
import { OrderStore } from '@/features/shop/order-store';
import { portOneConfig } from '@/features/shop/portone';

export async function POST(request: NextRequest) {
  const account = await currentAccount();
  if (!account) return privateJson({ error: 'login_required' }, 401);
  const origin = appOrigin(request);
  if (request.headers.get('origin') !== origin) return privateJson({ error: 'origin' }, 403);
  const legacy = z.uuid().safeParse(request.cookies.get(legacyOrderCookie)?.value);
  const config = portOneConfig();
  if (config && legacy.success) {
    const store = new OrderStore(config.database);
    try {
      store.claim('account:' + account.id, legacy.data);
    } finally {
      store.close();
    }
  }
  const response = NextResponse.redirect(new URL('/shop/orders', origin), {
    status: 303,
    headers: privateHeaders,
  });
  if (config) response.cookies.set(legacyOrderCookie, '', cookieOptions(origin, 0));
  return response;
}
