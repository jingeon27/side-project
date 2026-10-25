const certificate = '/run/rds/ca.pem';

/** The shared EC2 deployment uses dedicated RDS roles and verified TLS. */
export function sharedDatabaseUrl(env: NodeJS.ProcessEnv, migration = false) {
  const name = migration ? 'DATABASE_MIGRATION_URL' : 'DATABASE_URL';
  const value = env[name];
  const host = env.RDS_HOST;
  if (!host || !/^[a-z0-9.-]+\.rds\.amazonaws\.com$/.test(host))
    throw new Error('RDS_HOST must be the RDS endpoint.');
  const invalid = () => new Error(`${name} must use the dedicated RDS database, role and verified TLS.`);
  try {
    const url = new URL(value ?? '');
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
      url.searchParams.get('sslmode') !== 'require' ||
      url.searchParams.get('sslaccept') !== 'strict' ||
      url.searchParams.get('sslcert') !== certificate ||
      !/^[1-9]\d?$/.test(url.searchParams.get('connection_limit') ?? '') ||
      Number(url.searchParams.get('connection_limit')) > 10 ||
      !/^[1-9]\d?$/.test(url.searchParams.get('connect_timeout') ?? '') ||
      Number(url.searchParams.get('connect_timeout')) > 10 ||
      !/^[1-9]\d?$/.test(url.searchParams.get('pool_timeout') ?? '') ||
      Number(url.searchParams.get('pool_timeout')) > 30 ||
      ['host', 'options', 'sslidentity', 'sslpassword', 'sslrootcert', 'pgbouncer'].some((key) =>
        url.searchParams.has(key),
      ) ||
      [...url.searchParams.keys()].some((key) => url.searchParams.getAll(key).length !== 1)
    )
      throw invalid();
    return url.toString();
  } catch {
    throw invalid();
  }
}

export function validateSharedInstanceEnvironment(env: NodeJS.ProcessEnv) {
  if (env.DEPLOYMENT_TARGET !== 'shared-instance') return;
  sharedDatabaseUrl(env);
  if (!env.GF_S3_BUCKET || env.GF_S3_REGION !== 'ap-northeast-2' || env.GF_S3_ENDPOINT)
    throw new Error('Shared-instance production requires AWS S3 in ap-northeast-2.');
  if (env.GF_S3_BUCKET === env.OTHER_SERVICE_S3_BUCKET)
    throw new Error('Services must use separate S3 buckets.');
}
