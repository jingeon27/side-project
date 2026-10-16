import { developmentDatabaseUrl, testDatabaseUrl } from './env.mjs';

/** Never include the source URL in errors: it can contain credentials. */
export function guardDatabaseUrl(value, { test = false, allowTestSchema = false } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }
  const expected = new URL(test ? testDatabaseUrl : developmentDatabaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('Only PostgreSQL URLs are allowed.');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error('Local database commands require a loopback hostname.');
  if (url.port !== expected.port)
    throw new Error(`Local database commands require dedicated port ${expected.port}.`);
  if (decodeURIComponent(url.username) !== 'game_feedback')
    throw new Error('Local database commands require the game_feedback database role.');
  if (url.pathname !== expected.pathname)
    throw new Error(`Local database commands require database ${expected.pathname.slice(1)}.`);
  if (!url.password) throw new Error('A dedicated database password is required.');
  const schema = url.searchParams.get('schema') ?? 'public';
  if (!(schema === 'public' || (test && allowTestSchema && /^gf_test_[a-z0-9_]{1,64}$/.test(schema)))) {
    throw new Error('Only public or an owned gf_test_ test schema is allowed.');
  }
  const allowedParams = new Set(['schema', 'connection_limit', 'pool_timeout', 'connect_timeout']);
  for (const key of url.searchParams.keys()) {
    if (!allowedParams.has(key) || url.searchParams.getAll(key).length !== 1)
      throw new Error('Unsupported or duplicate database URL option.');
  }
  if (url.hash) throw new Error('Database URL fragments are not allowed.');
  return {
    url,
    database: url.pathname.slice(1),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    port: Number(url.port),
    schema,
  };
}
