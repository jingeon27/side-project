import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { ApiError, getPublicProfile } from '@game-feedback/sdk';
import { serverRequestOptions } from '@/shared/api/server';
export const getServerProfile = cache(async (id: string) => {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) notFound();
  try {
    return await getPublicProfile(id, await serverRequestOptions());
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
});
