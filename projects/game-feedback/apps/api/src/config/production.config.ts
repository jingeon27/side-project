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
export function validateProductionEnvironment(env: NodeJS.ProcessEnv, migration = false) {
  if (env.ENVIRONMENT !== 'production') return;
  validateSharedInstanceEnvironment(env, migration);
  const result = z
    .object({
      WEB_ORIGIN: publicOrigin,
      GAME_FEEDBACK_CONTACT_EMAIL: z.email(),
      DATABASE_URL: secret,
    })
    .safeParse(env);
  if (!result.success)
    throw new Error(
      `Invalid production settings: ${[...new Set(result.error.issues.map((issue) => issue.path[0]))].join(', ')}.`,
    );
  const database = z.url().safeParse(env.DATABASE_URL);
  if (!database.success) throw new Error('DATABASE_URL is invalid.');
  const db = new URL(database.data);
  if (!['postgresql:', 'postgres:'].includes(db.protocol) || decodeURIComponent(db.password).length < 32)
    throw new Error('Production DATABASE_URL requires PostgreSQL and a password of at least 32 characters.');
  const providers = ['GOOGLE', 'KAKAO', 'DISCORD'] as const;
  const configured = providers.map((prefix) => {
    const clientId = env[`${prefix}_CLIENT_ID`];
    const clientSecret = env[`${prefix}_CLIENT_SECRET`];
    if (!clientId && !clientSecret) return false;
    if (!secret.safeParse(clientId).success || !secret.safeParse(clientSecret).success)
      throw new Error(`${prefix}_CLIENT_ID and ${prefix}_CLIENT_SECRET must both be configured.`);
    return true;
  });
  if (!configured.some(Boolean)) throw new Error('Configure at least one production OAuth provider.');
}

export function resolveListenConfig(env: NodeJS.ProcessEnv) {
  const url = URL.parse(env.GAME_FEEDBACK_API_URL ?? 'http://127.0.0.1:4300');
  if (
    !url ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('GAME_FEEDBACK_API_URL must be an HTTP(S) origin.');
  return {
    HOST: env.ENVIRONMENT === 'production' ? '0.0.0.0' : '127.0.0.1',
    PORT: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
  };
}
