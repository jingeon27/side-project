/** Alias of the host PostgreSQL container on the service's internal network (deploy/shared-instance/database). */
const host = 'shared-postgres';

/** Whether DATABASE_URL targets the shared EC2 database rather than a local or test server. */
export function usesSharedDatabase(env: NodeJS.ProcessEnv) {
  return URL.parse(env.DATABASE_URL ?? '')?.hostname === host;
}

/**
 * The shared EC2 deployment uses dedicated runtime and migration roles on the host database. Traffic stays on an
 * internal Docker network of the same host, so the URL turns TLS off explicitly and carries no certificate settings.
 */
export function sharedDatabaseUrl(env: NodeJS.ProcessEnv, migration = false) {
  const name = 'DATABASE_URL';
  const invalid = () => new Error(`${name} must use the dedicated shared database and role.`);
  try {
    const url = new URL(env[name] ?? '');
    const role = migration ? 'game_feedback_migrator' : 'game_feedback';
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== host ||
      url.port !== '5432' ||
      url.pathname !== '/game_feedback' ||
      decodeURIComponent(url.username) !== role ||
      decodeURIComponent(url.password).length < 32 ||
      url.hash ||
      url.searchParams.get('schema') !== 'public' ||
      url.searchParams.get('sslmode') !== 'disable' ||
      !/^[1-9]\d?$/.test(url.searchParams.get('connection_limit') ?? '') ||
      Number(url.searchParams.get('connection_limit')) > 10 ||
      !/^[1-9]\d?$/.test(url.searchParams.get('connect_timeout') ?? '') ||
      Number(url.searchParams.get('connect_timeout')) > 10 ||
      !/^[1-9]\d?$/.test(url.searchParams.get('pool_timeout') ?? '') ||
      Number(url.searchParams.get('pool_timeout')) > 30 ||
      [
        'host',
        'options',
        'sslaccept',
        'sslcert',
        'sslidentity',
        'sslpassword',
        'sslrootcert',
        'pgbouncer',
      ].some((key) => url.searchParams.has(key)) ||
      [...url.searchParams.keys()].some((key) => url.searchParams.getAll(key).length !== 1)
    )
      throw invalid();
    return url.toString();
  } catch {
    throw invalid();
  }
}

/** Both services share one private bucket; the service IAM user only reaches its own game-feedback/<folder>/. */
const keyPrefix = /^game-feedback(?:\/[A-Za-z0-9_-]+)+\/?$/;

export function validateSharedInstanceEnvironment(env: NodeJS.ProcessEnv, migration = false) {
  if (!usesSharedDatabase(env)) return;
  sharedDatabaseUrl(env, migration);
  if (!env.GF_S3_BUCKET || env.GF_S3_REGION !== 'ap-northeast-2' || env.GF_S3_ENDPOINT)
    throw new Error('Shared-instance production requires AWS S3 in ap-northeast-2.');
  if (!keyPrefix.test((env.GF_S3_KEY_PREFIX ?? '').trim()))
    throw new Error('Shared-instance production requires a game-feedback/<folder> S3 key prefix.');
}
