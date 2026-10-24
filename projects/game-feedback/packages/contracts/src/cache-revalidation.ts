import { z } from 'zod';

export const POSTS_CACHE_TAG = 'posts';
export const DISCOVERY_CACHE_TAG = 'discovery';
export const CacheTagSchema = z.string().regex(/^(?:posts|discovery|post:[A-Za-z0-9_-]{1,100})$/);
export const CacheRevalidationSchema = z
  .object({
    tags: z.array(CacheTagSchema).min(1).max(64),
  })
  .strict();

export function postCacheTag(id: string) {
  return CacheTagSchema.parse(`post:${id}`);
}
