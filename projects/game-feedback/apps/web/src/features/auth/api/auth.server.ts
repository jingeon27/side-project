import 'server-only';

import { cache } from 'react';
import { cacheLife } from 'next/cache';

import { getSession } from '@game-feedback/sdk';

import { hasSessionCookie, publicServerOptions, serverRequestOptions } from '@/shared/api/server';

// Without a session cookie the response only reflects server configuration (demo mode, OAuth
// providers), so every anonymous document shares one cached copy instead of calling the API.
async function getAnonymousSession() {
  'use cache';
  cacheLife('minutes');
  return getSession(publicServerOptions());
}
export const getServerSession = cache(async () =>
  (await hasSessionCookie()) ? getSession(await serverRequestOptions()) : getAnonymousSession(),
);
