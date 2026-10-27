/** 서비스 내부 네트워크에서 쓰는 호스트 PostgreSQL 컨테이너의 별칭(deploy/shared-instance/database). */
const host = 'shared-postgres';

/**
 * 공통 VM은 앱/DDL 계정을 나눈다. DB 연결은 같은 호스트의 내부 Docker 네트워크를 벗어나지 않으므로
 * TLS를 명시적으로 끄고 인증서 설정을 받지 않는다.
 */
export function sharedDatabaseUrl(env: NodeJS.ProcessEnv, migration = false) {
  const key = 'DATABASE_URL';
  const invalid = () => new Error(`${key} requires the dedicated shared database and role.`);
  try {
    const url = new URL(env[key] ?? '');
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== host ||
      url.port !== '5432' ||
      url.pathname !== '/photo_contest' ||
      decodeURIComponent(url.username) !== (migration ? 'photo_contest_migrator' : 'photo_contest') ||
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
      ].some((name) => url.searchParams.has(name)) ||
      [...url.searchParams.keys()].some((name) => url.searchParams.getAll(name).length !== 1)
    )
      throw invalid();
    return url.toString();
  } catch {
    throw invalid();
  }
}

/** 두 서비스가 비공개 버킷 하나를 나눠 쓰며 서비스 IAM 사용자는 photo-contest/<폴더>/만 다룬다. */
const keyPrefix = /^photo-contest(?:\/[A-Za-z0-9_-]+)+\/?$/;

export function assertSharedInstanceConfig(env: NodeJS.ProcessEnv, migration = false) {
  if (URL.parse(env.DATABASE_URL ?? '')?.hostname !== host) return;
  sharedDatabaseUrl(env, migration);
  if (!env.S3_BUCKET || env.S3_REGION !== 'ap-northeast-2' || env.S3_ENDPOINT)
    throw new Error('Shared-instance production requires AWS S3 in ap-northeast-2.');
  if (!keyPrefix.test((env.S3_KEY_PREFIX ?? '').trim()))
    throw new Error('Shared-instance production requires a photo-contest/<folder> S3 key prefix.');
}
