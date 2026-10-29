import { ensureRuntimeSecret } from '../config/runtime-secret';

export interface ICacheRevalidationConfig {
  url: string;
  secret: string;
}

export function resolveCacheRevalidationConfig(env: NodeJS.ProcessEnv): ICacheRevalidationConfig | undefined {
  if (env.ENVIRONMENT === 'test') return;
  const parsed = new URL(env.WEB_ORIGIN ?? 'http://localhost:3300');
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  )
    throw new Error('WEB_ORIGIN must be an HTTP(S) origin.');
  const origin = env.ENVIRONMENT === 'production' ? 'http://gf-web:3300' : parsed.origin;
  return { url: `${origin}/internal/cache/revalidate`, secret: ensureRuntimeSecret() };
}
