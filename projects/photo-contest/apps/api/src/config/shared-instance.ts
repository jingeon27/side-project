/** 공통 VM은 앱/DDL 계정을 나누고 RDS 인증서를 검증한다. */
export function sharedDatabaseUrl(env: NodeJS.ProcessEnv, migration = false) {
  const key = migration ? 'DATABASE_MIGRATION_URL' : 'DATABASE_URL';
  const invalid = () => new Error(`${key} requires the dedicated RDS database, role and verified TLS.`);
  if (!env.RDS_HOST || !/^[a-z0-9.-]+\.rds\.amazonaws\.com$/.test(env.RDS_HOST))
    throw new Error('RDS_HOST must be the RDS endpoint.');
  try {
    const url = new URL(env[key] ?? '');
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== env.RDS_HOST ||
      url.port !== '5432' ||
      url.pathname !== '/photo_contest' ||
      decodeURIComponent(url.username) !== (migration ? 'photo_contest_migrator' : 'photo_contest') ||
      decodeURIComponent(url.password).length < 32 ||
      url.hash ||
      url.searchParams.get('schema') !== 'public' ||
      url.searchParams.get('sslmode') !== 'require' ||
      url.searchParams.get('sslaccept') !== 'strict' ||
      url.searchParams.get('sslcert') !== '/run/rds/ca.pem' ||
      !/^[1-9]\d?$/.test(url.searchParams.get('connection_limit') ?? '') ||
      Number(url.searchParams.get('connection_limit')) > 10 ||
      !/^[1-9]\d?$/.test(url.searchParams.get('connect_timeout') ?? '') ||
      Number(url.searchParams.get('connect_timeout')) > 10 ||
      !/^[1-9]\d?$/.test(url.searchParams.get('pool_timeout') ?? '') ||
      Number(url.searchParams.get('pool_timeout')) > 30 ||
      ['host', 'options', 'sslidentity', 'sslpassword', 'sslrootcert', 'pgbouncer'].some((name) =>
        url.searchParams.has(name),
      ) ||
      [...url.searchParams.keys()].some((name) => url.searchParams.getAll(name).length !== 1)
    )
      throw invalid();
    return url.toString();
  } catch {
    throw invalid();
  }
}

export function assertSharedInstanceConfig(env: NodeJS.ProcessEnv) {
  if (env.DEPLOYMENT_TARGET !== 'shared-instance') return;
  sharedDatabaseUrl(env);
  if (!env.S3_BUCKET || env.S3_REGION !== 'ap-northeast-2' || env.S3_ENDPOINT)
    throw new Error('Shared-instance production requires AWS S3 in ap-northeast-2.');
  if (env.S3_BUCKET === env.OTHER_SERVICE_S3_BUCKET)
    throw new Error('Services must use separate S3 buckets.');
}
