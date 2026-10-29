import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';

import { DISCOVERY_CACHE_TAG } from '@game-feedback/contracts';
import { listCategories } from '@game-feedback/sdk';

import { publicServerOptions } from '@/shared/api/server';

// Categories are public and identical for every visitor. Category creation invalidates the discovery tag.
export async function getPublicCategories() {
  'use cache';
  cacheTag(DISCOVERY_CACHE_TAG);
  cacheLife('minutes');
  return listCategories(publicServerOptions());
}
