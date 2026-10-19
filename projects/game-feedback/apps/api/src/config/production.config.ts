import { z } from 'zod';
import { validateSharedInstanceEnvironment } from './shared-instance.config';

const publicOrigin = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === 'https:' &&
    url.origin === value &&
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
    !/\.(example|invalid|localhost)$/.test(url.hostname)
  );
});
const secret = z
  .string()
  .min(1)
  .refine((value) => !/^(change[-_]?me|replace[-_]?me|example)$/i.test(value));

/** Report variable names only: validation errors must never print credentials. */
export function validateProductionEnvironment(env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV !== 'production') return;
  validateSharedInstanceEnvironment(env);
  const result = z
    .object({
      WEB_ORIGIN: publicOrigin,
      GAME_FEEDBACK_SITE_URL: publicOrigin,
      GAME_FEEDBACK_CONTACT_EMAIL: z.email(),
      GF_DEMO_MODE: z.literal('false'),
      GF_TEST_AUTH_ENABLED: z.literal('false'),
      GF_PREFETCH_TESTING: z.enum(['false', '']).optional(),
      DATABASE_URL: secret,
    })
    .safeParse(env);
  if (!result.success)
    throw new Error(
      `Invalid production settings: ${[...new Set(result.error.issues.map((issue) => issue.path[0]))].join(', ')}.`,
    );
  if (env.GAME_FEEDBACK_SITE_URL !== env.WEB_ORIGIN)
    throw new Error('GAME_FEEDBACK_SITE_URL must match WEB_ORIGIN.');
  const database = z.url().safeParse(env.DATABASE_URL);
  if (!database.success) throw new Error('DATABASE_URL is invalid.');
  const db = new URL(database.data);
  if (!['postgresql:', 'postgres:'].includes(db.protocol) || decodeURIComponent(db.password).length < 32)
    throw new Error('Production DATABASE_URL requires PostgreSQL and a password of at least 32 characters.');
  const providers = ['GOOGLE', 'X', 'KAKAO', 'DISCORD'] as const;
  const configured = providers.map((prefix) => {
    const clientId = env[`${prefix}_CLIENT_ID`];
    const clientSecret = env[`${prefix}_CLIENT_SECRET`];
    if (!clientId && !clientSecret) return false;
    if (!secret.safeParse(clientId).success || !secret.safeParse(clientSecret).success)
      throw new Error(`${prefix}_CLIENT_ID and ${prefix}_CLIENT_SECRET must both be configured.`);
    const redirect = env[`${prefix}_REDIRECT_URI`];
    if (redirect) {
      const url = z.url().safeParse(redirect);
      if (!url.success || new URL(url.data).origin !== env.WEB_ORIGIN)
        throw new Error(`${prefix}_REDIRECT_URI must use WEB_ORIGIN.`);
    }
    return true;
  });
  if (!configured.some(Boolean)) throw new Error('Configure at least one production OAuth provider.');
}

export function resolveListenConfig(env: NodeJS.ProcessEnv) {
  const result = z
    .object({
      HOST: z.enum(['127.0.0.1', '0.0.0.0', '::1', '::']).default('127.0.0.1'),
      PORT: z.coerce.number().int().min(1).max(65535).default(4300),
    })
    .safeParse(env);
  if (!result.success) throw new Error('HOST or PORT is invalid.');
  return result.data;
}
