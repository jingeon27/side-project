export interface ICacheRevalidationConfig {
  url: string;
  secret: string;
}

export function resolveCacheRevalidationConfig(env: NodeJS.ProcessEnv): ICacheRevalidationConfig | undefined {
  const secret = env.GF_CACHE_REVALIDATION_SECRET;
  const url = env.GF_CACHE_REVALIDATION_URL;
  if (!secret && !url && env.NODE_ENV !== 'production') return;
  if (!secret || secret.length < 32 || !url)
    throw new Error(
      'GF_CACHE_REVALIDATION_SECRET (at least 32 characters) and GF_CACHE_REVALIDATION_URL are required.',
    );
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('GF_CACHE_REVALIDATION_URL is invalid.');
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/_internal/cache/revalidate' ||
    parsed.search ||
    parsed.hash
  )
    throw new Error(
      'GF_CACHE_REVALIDATION_URL must point to /_internal/cache/revalidate without credentials or query parameters.',
    );
  return { url, secret };
}
