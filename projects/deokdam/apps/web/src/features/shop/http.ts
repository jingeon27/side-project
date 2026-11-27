import type { NextRequest } from 'next/server';

import { z } from 'zod';

const cookieName = 'deokdam.order-owner';

export function orderOwner(request: NextRequest) {
  const cookie = z.uuid().safeParse(request.cookies.get(cookieName)?.value);
  return cookie.success ? cookie.data : undefined;
}

export function ownerCookie(owner: string, origin: string) {
  return {
    name: cookieName,
    value: owner,
    path: '/',
    httpOnly: true,
    secure: new URL(origin).protocol === 'https:',
    sameSite: 'lax' as const,
    maxAge: 365 * 24 * 60 * 60,
  };
}

export const orderResponseHeaders = { 'cache-control': 'private, no-store' };
