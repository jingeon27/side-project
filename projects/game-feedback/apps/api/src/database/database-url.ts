export function assertDatabaseUrl(value: string | undefined, env = process.env.NODE_ENV) {
  if (!value) throw new Error('DATABASE_URL is required.');
  const parsed = new URL(value);
  if (!['postgresql:', 'postgres:'].includes(parsed.protocol))
    throw new Error('DATABASE_URL must use PostgreSQL.');
  const database = parsed.pathname.slice(1);
  if (parsed.searchParams.has('options'))
    throw new Error('Database options overriding schema isolation are forbidden.');
  if (decodeURIComponent(parsed.username) !== 'game_feedback')
    throw new Error('Use the isolated game_feedback database user.');
  if (env === 'test') {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.port !== '55444')
      throw new Error('Tests require loopback PostgreSQL port 55444.');
    if (
      database !== 'game_feedback_test' ||
      !/^gf_test_[a-z0-9_]+$/.test(parsed.searchParams.get('schema') ?? '')
    )
      throw new Error('Tests require game_feedback_test and an isolated gf_test_ schema.');
  } else if (database !== 'game_feedback')
    throw new Error('Only the dedicated game_feedback database is allowed.');
  return value;
}
