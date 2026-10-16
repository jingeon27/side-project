import 'server-only';
import { cache } from 'react';
import { getSession } from '@game-feedback/sdk';
import { serverRequestOptions } from '@/shared/api/server';
export const getServerSession = cache(async () => getSession(await serverRequestOptions()));
