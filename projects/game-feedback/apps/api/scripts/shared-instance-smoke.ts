import assert from 'node:assert/strict';
import { spawn, spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import type { IncomingMessage, OutgoingHttpHeaders } from 'node:http';
import { request } from 'node:https';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import dayjs from 'dayjs';

import {
  adminResponse,
  completedUploadResponse,
  conversationResponse,
  mediaResponse as decodeMediaResponse,
  groupResponse,
  invalidationResponse,
  mediaPlanResponse,
  parseJson,
  postResponse,
  postUploadResponse,
  readObject,
  signedContentResponse,
  storageResponse,
} from './shared-instance/response.ts';
import { assertAnonymousSession } from './shared-instance/session-check.ts';
import { verificationEvidence, type IRestoreMeasurement } from './shared-instance/verification-evidence.ts';

// API-owned integration runner. Registry and backup-bucket boundaries are isolated; media uses configured AWS S3;
// the shared database is the real deploy/shared-instance/database container started by database.sh.
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../../..');
for (const project of ['game-feedback', 'photo-contest']) {
  const file = join(repo, 'projects', project, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}
const required = (name: string) => {
  const value = process.env[name];
  assert.ok(value, `Configure ${name} for the real S3 smoke test.`);
  return value;
};
assert.ok(!process.env.GF_S3_ENDPOINT && !process.env.S3_ENDPOINT, 'Smoke tests require AWS S3.');
const storageRunId = randomBytes(16).toString('hex');
const storage = {
  'game-feedback': {
    GF_S3_BUCKET: required('GF_S3_BUCKET'),
    GF_S3_REGION: 'ap-northeast-2',
    GF_S3_KEY_PREFIX: [process.env.GF_S3_KEY_PREFIX, 'tests', storageRunId].filter(Boolean).join('/'),
    GF_S3_ACCESS_KEY_ID: required('GF_S3_ACCESS_KEY_ID'),
    GF_S3_SECRET_ACCESS_KEY: required('GF_S3_SECRET_ACCESS_KEY'),
  },
  'photo-contest': {
    S3_BUCKET: required('S3_BUCKET'),
    S3_REGION: 'ap-northeast-2',
    S3_KEY_PREFIX: [process.env.S3_KEY_PREFIX, 'tests', storageRunId].filter(Boolean).join('/'),
    AWS_ACCESS_KEY_ID: required('AWS_ACCESS_KEY_ID'),
    AWS_SECRET_ACCESS_KEY: required('AWS_SECRET_ACCESS_KEY'),
    ...(process.env.AWS_SESSION_TOKEN ? { AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN } : {}),
  },
};
const source = join(repo, 'deploy/shared-instance');
const [, , sha = ''] = process.argv;
assert.match(sha ?? '', /^[a-f0-9]{40}$/);
const id = randomBytes(5).toString('hex');
const prefix = `side-shared-smoke-${id}`;
const scratch = join(repo, 'projects/game-feedback/.data');
mkdirSync(scratch, { recursive: true });
const root = mkdtempSync(join(scratch, 'shared-instance-'));
const host = 'shared-postgres';
const gfDomain = 'game.bambyul.com';
const pcDomain = 'contest.bambyul.com';
const gfApiDomain = `api.${gfDomain}`;
const pcApiDomain = `api.${pcDomain}`;
const realDocker = spawnSync('sh', ['-c', 'command -v docker'], { encoding: 'utf8' }).stdout.trim();
// Compose prefers shell variables over --env-file values. Drop the runner's S3 settings so each service .env decides
// the bucket, credentials and run-scoped prefix, as on the host.
const storageNames = new Set([
  ...Object.values(storage).flatMap(Object.keys),
  'AWS_SESSION_TOKEN',
  'GF_S3_ENDPOINT',
  'S3_ENDPOINT',
]);
const baseEnv = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !storageNames.has(name))),
  PATH: process.env.PATH ?? '',
  SIDE_DEPLOY_ROOT: root,
  SIDE_PROJECT_PREFIX: prefix,
  SIDE_NETWORK_PREFIX: prefix,
  SIDE_LOCAL_IMAGES: '1',
  SIDE_REAL_DOCKER: realDocker,
  SIDE_SMOKE_IMAGE_MAP: join(root, 'images.json'),
  SIDE_SMOKE_UPLOAD_LOG: join(root, 'uploads.log'),
  SIDE_POSTGRES_ROOT: join(root, 'postgres'),
};
const images: Record<string, string> = {};
const createdImages: string[] = [];
const password = randomBytes(32).toString('hex');
const schemaPassword = randomBytes(32).toString('hex');
const proxyEnv = {
  GAME_FEEDBACK_DOMAIN: gfDomain,
  GAME_FEEDBACK_API_DOMAIN: gfApiDomain,
  PHOTO_CONTEST_DOMAIN: pcDomain,
  PHOTO_CONTEST_API_DOMAIN: pcApiDomain,
  ACME_EMAIL: 'operator@example.test',
  GAME_FEEDBACK_S3_BUCKET: storage['game-feedback'].GF_S3_BUCKET,
  PHOTO_CONTEST_S3_BUCKET: storage['photo-contest'].S3_BUCKET,
  BACKUP_BUCKET: 'side-smoke-backup',
  BACKUP_REGION: 'ap-northeast-2',
  SIDE_BIND_ADDRESS: '127.0.0.1',
  SIDE_HTTP_PORT: '0',
  SIDE_HTTPS_PORT: '0',
};
const projects: string[] = [];
const cleanupState = { failed: false };
const verification = {
  complete: false,
  durations: [] as number[],
  failures: 0,
  restores: [] as IRestoreMeasurement[],
};

function run(
  binary: string,
  args: string[],
  options: Omit<SpawnSyncOptionsWithStringEncoding, 'encoding'> = {},
) {
  const result = spawnSync(binary, args, {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    env: baseEnv,
    ...options,
  });
  if (result.status !== 0)
    throw new Error(`${binary} failed (${result.status}): ${result.stderr || result.stdout}`);
  return result.stdout;
}
function saveEnv(file: string, values: Record<string, string | undefined>) {
  writeFileSync(
    file,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
    { mode: 0o600 },
  );
}
function compose(project: string, file: string, args: string[]) {
  return run('docker', [
    'compose',
    '--project-name',
    project,
    '--env-file',
    join(root, '.env'),
    '-f',
    file,
    ...args,
  ]);
}
const proxyFile = join(root, 'proxy/compose.yaml');
function databaseCompose(args: string[], options: Omit<SpawnSyncOptionsWithStringEncoding, 'encoding'> = {}) {
  return run(
    'docker',
    [
      'compose',
      '--project-name',
      `${prefix}-database`,
      '--env-file',
      join(root, 'database/.env'),
      '-f',
      join(root, 'database/compose.yaml'),
      ...args,
    ],
    options,
  );
}
function serviceCompose(service: string, args: string[], revision = sha) {
  return run('docker', [
    'compose',
    '--project-name',
    `${prefix}-${service}`,
    '--env-file',
    join(root, '.env'),
    '--env-file',
    join(root, `services/${service}/.env`),
    '--env-file',
    join(root, `services/${service}/releases/${revision}/.release.env`),
    '-f',
    join(root, `services/${service}/releases/${revision}/compose.yaml`),
    ...args,
  ]);
}
function checkStorage(service: string, cleanup = false) {
  serviceCompose(service, [
    'exec',
    '-T',
    'api',
    'node',
    '--input-type=module',
    '-e',
    `
    const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const gf = process.argv[1] === 'game-feedback';
    const bucket = process.env[gf ? 'GF_S3_BUCKET' : 'S3_BUCKET'];
    const prefix = process.env[gf ? 'GF_S3_KEY_PREFIX' : 'S3_KEY_PREFIX'];
    if (!prefix?.endsWith('/tests/' + process.argv[2])) throw new Error('Unowned S3 test prefix');
    const cleanup = process.argv[3] === 'cleanup';
    const client = new S3Client({region:'ap-northeast-2', ...(gf ? {credentials:{accessKeyId:process.env.GF_S3_ACCESS_KEY_ID,secretAccessKey:process.env.GF_S3_SECRET_ACCESS_KEY}} : {})});
    const state = {};
    try {
      do {
        const page = await client.send(new ListObjectsV2Command({Bucket:bucket,Prefix:prefix+'/',ContinuationToken:state.token,MaxKeys:cleanup?1000:1}), {abortSignal:AbortSignal.timeout(15000)});
        if (!cleanup) break;
        for (const object of page.Contents ?? []) {
          if (!object.Key?.startsWith(prefix+'/')) throw new Error('Unowned S3 test object');
          await client.send(new DeleteObjectCommand({Bucket:bucket,Key:object.Key}), {abortSignal:AbortSignal.timeout(15000)});
        }
        state.token = page.NextContinuationToken;
      } while (state.token);
    } finally { client.destroy(); }
  `,
    service,
    storageRunId,
    cleanup ? 'cleanup' : 'verify',
  ]);
}
function uploadForm(
  service: string,
  upload: { url: string; fields: Record<string, string> | { name: string; value: string }[] },
  bytes: Buffer,
) {
  checkStorage(service);
  const fields = Array.isArray(upload.fields)
    ? upload.fields
    : Object.entries(upload.fields).map(([name, value]) => ({ name, value }));
  const stored = parseJson(
    serviceCompose(service, [
      'exec',
      '-T',
      'api',
      'node',
      '--input-type=module',
      '-e',
      `const [url, fields, body] = JSON.parse(process.argv[1]);
     const form = new FormData();
     for (const { name, value } of fields) form.append(name, value);
     form.append('file', new Blob([Buffer.from(body, 'base64')], {type: 'image/png'}), 'shared.png');
     const response = await fetch(url, {method: 'POST', body: form});
     console.log(JSON.stringify({status: response.status, body: await response.text()}));`,
      JSON.stringify([upload.url, fields, bytes.toString('base64')]),
    ]),
    storageResponse,
  );
  assert.equal(stored.status, 204, stored.body);
}
function sql(database: string, text: string) {
  return databaseCompose([
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'postgres',
    '-d',
    database,
    '-XAt',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    text,
  ]).trim();
}
/** 이 실행이 소유한 PostgreSQL 컨테이너 안에서 별도 DB에 실제 덤프를 복원한다. */
function measureDatabaseRestore({ service }: { service: 'game-feedback' | 'photo-contest' }) {
  const database = service.replace('-', '_');
  const restored = `ci_restore_${id}_${database}`;
  const dump = `/tmp/${prefix}-${database}.dump`;
  const tables =
    service === 'game-feedback'
      ? ['User', 'Post', 'Comment', 'ChatMessage']
      : ['User', 'Post', 'PostComment', 'Group'];
  const fingerprint = (table: string) =>
    `SELECT count(*)::text || ':' || md5(COALESCE(string_agg(t::text, chr(10) ORDER BY t."id"), '')) FROM "${table}" t`;
  const expected = tables.map((table) => ({ table, value: sql(database, fingerprint(table)) }));
  const backupStartedAt = dayjs().toISOString();
  databaseCompose(['exec', '-T', 'postgres', 'pg_dump', '-U', 'postgres', '-d', database, '-Fc', '-f', dump]);
  const backupCompletedAt = dayjs().toISOString();
  const started = performance.now();
  try {
    databaseCompose(['exec', '-T', 'postgres', 'createdb', '-U', 'postgres', '-T', 'template0', restored]);
    databaseCompose([
      'exec',
      '-T',
      'postgres',
      'pg_restore',
      '-U',
      'postgres',
      '--no-owner',
      '--no-acl',
      '--exit-on-error',
      '-d',
      restored,
      dump,
    ]);
    for (const { table, value } of expected)
      assert.equal(
        sql(restored, fingerprint(table)),
        value,
        `${service} ${table} restored content must match`,
      );
    verification.restores.push({
      service,
      backupStartedAt,
      backupCompletedAt,
      databaseRestoreMs: Math.ceil(performance.now() - started),
      verifiedTables: tables.length,
      verifiedRows: expected.reduce((total, { value }) => total + Number(value.split(':')[0]), 0),
    });
  } finally {
    databaseCompose(['exec', '-T', 'postgres', 'dropdb', '-U', 'postgres', '--if-exists', restored]);
    databaseCompose(['exec', '-T', 'postgres', 'rm', '-f', dump]);
  }
}

function release(service: string, revision: string) {
  const directory = join(root, `services/${service}/releases/${revision}`);
  mkdirSync(directory, { recursive: true });
  cpSync(
    join(repo, `projects/${service}/deploy/shared-instance/compose.yaml`),
    join(directory, 'compose.yaml'),
  );
  mkdirSync(join(directory, 'host'));
  readdirSync(join(source, 'scripts')).forEach((file) =>
    cpSync(join(source, 'scripts', file), join(directory, 'host', file)),
  );
  return directory;
}
function operate(
  service: string,
  args: string[],
  options: Omit<SpawnSyncOptionsWithStringEncoding, 'encoding'> = {},
) {
  return run(
    'bash',
    [join(root, `services/${service}/releases/${sha}/host/service.sh`), service, ...args],
    options,
  );
}
function reference(
  service: string,
  app: string,
  tag = `side-shared-${service === 'game-feedback' ? 'gf' : 'pc'}-${app}:${sha}`,
) {
  const image = run('docker', ['image', 'inspect', '--format', '{{.Id}}', tag]).trim();
  const ref = `ghcr.io/jingeon27/side-project-${service}-${app}@sha256:${createHash('sha256').update(image).digest('hex')}`;
  images[ref] = tag;
  return ref;
}
async function retry<T>(fn: () => Promise<T> | T, left = 30): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (left === 0) throw error;
    await delay(300);
    return retry(fn, left - 1);
  }
}
interface IHttpOptions {
  method?: string;
  headers?: OutgoingHttpHeaders;
  body?: string | Buffer;
}

class Client {
  cookie: string | undefined = '';
  domain: string;
  port: number;
  ca: string | Buffer;
  constructor(domain: string, port: number, ca: string | Buffer) {
    this.domain = domain;
    this.port = port;
    this.ca = ca;
  }
  open(path: string, { method = 'GET', headers, body }: IHttpOptions = {}) {
    return new Promise<IncomingMessage>((accept, reject) => {
      const req = request(
        {
          hostname: '127.0.0.1',
          port: this.port,
          servername: this.domain,
          ca: this.ca,
          path,
          method,
          headers: {
            Host: this.domain,
            Origin: `https://${this.domain}`,
            ...(this.cookie ? { Cookie: this.cookie } : {}),
            ...headers,
          },
        },
        accept,
      );
      req.on('error', reject);
      req.setTimeout(145000, () => req.destroy(new Error('HTTPS smoke timed out')));
      req.end(body);
    });
  }
  async http(path: string, options: IHttpOptions = {}) {
    const response = await this.open(path, options);
    const chunks: Buffer[] = [];
    const stream: AsyncIterable<unknown> = response;
    for await (const chunk of stream) {
      assert.ok(Buffer.isBuffer(chunk), 'Expected an HTTP byte chunk');
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    return {
      status: response.statusCode,
      headers: response.headers,
      body,
      text: () => body.toString(),
      json: <T>(decode: (value: unknown) => T) => parseJson(body.toString(), decode),
    };
  }
  post(path: string, data: unknown, headers: OutgoingHttpHeaders = {}) {
    return this.http(path, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }
  async graphql(query: string, variables: Record<string, unknown> = {}) {
    const response = await this.post('/backend/graphql', { query, variables });
    assert.equal(response.status, 200, response.text());
    assert.equal(response.json(readObject).errors, undefined, response.text());
    return response;
  }
}

class EventReader {
  buffer = '';
  iterator: AsyncIterator<unknown>;
  constructor(stream: IncomingMessage) {
    this.iterator = stream[Symbol.asyncIterator]();
  }
  async invalidate(): Promise<ReturnType<typeof invalidationResponse>> {
    const boundary = this.buffer.indexOf('\n\n');
    if (boundary >= 0) {
      const frame = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const lines = frame.split('\n');
      if (
        lines
          .find((line) => line.startsWith('event:'))
          ?.slice(6)
          .trim() !== 'invalidate'
      )
        return this.invalidate();
      const data = lines.find((line) => line.startsWith('data:'));
      assert.ok(data, 'SSE invalidation must contain data');
      return parseJson(data.slice(5), invalidationResponse);
    }
    const chunk = await this.iterator.next();
    assert.equal(chunk.done, false, 'SSE ended before invalidation');
    assert.ok(Buffer.isBuffer(chunk.value) || typeof chunk.value === 'string', 'Expected an SSE byte chunk');
    this.buffer += chunk.value.toString().replaceAll('\r\n', '\n');
    return this.invalidate();
  }
}

try {
  mkdirSync(join(root, 'bin'));
  mkdirSync(join(root, 'postgres/data'), { recursive: true });
  // user-data writes this marker when it formats the EBS volume; database.sh refuses to start without it.
  writeFileSync(join(root, 'postgres/.side-postgres-volume'), 'volume=smoke\n');
  run('bash', [join(source, 'scripts/prepare.sh')]);
  saveEnv(join(root, '.env'), proxyEnv);
  writeFileSync(baseEnv.SIDE_SMOKE_IMAGE_MAP, '{}');
  cpSync(join(source, 'compose.yaml'), proxyFile);
  writeFileSync(
    join(root, 'proxy/Caddyfile'),
    readFileSync(join(source, 'Caddyfile'), 'utf8').replace('{\n', '{\n\tlocal_certs\n'),
  );
  cpSync(join(here, 'shared-instance/docker-fixture.py'), join(root, 'bin/docker'));
  run('chmod', ['700', join(root, 'bin/docker')]);
  projects.push('proxy');
  run('bash', [join(source, 'scripts/proxy.sh'), 'validate']);
  baseEnv.PATH = `${root}/bin:${process.env.PATH}`;
  projects.push('database');
  run('bash', [join(source, 'scripts/database.sh'), 'start']);
  // database.sh bootstrap prompts for passwords on a terminal; the smoke feeds the same SQL with fixed passwords.
  databaseCompose(['exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-f', '-'], {
    input: readFileSync(join(source, 'database/bootstrap.sql'), 'utf8').replace(
      /^\\password (\w+)$/gm,
      (_match: string, role: string) =>
        `ALTER ROLE ${role} PASSWORD '${role.endsWith('_migrator') ? schemaPassword : password}';`,
    ),
  });
  const runtimeUrl = (database: string, migration = false) =>
    `postgresql://${database}${migration ? '_migrator' : ''}:${migration ? schemaPassword : password}@${host}:5432/${database}?schema=public&sslmode=disable&connection_limit=${migration ? 2 : 5}&pool_timeout=10&connect_timeout=5`;
  const refs: Record<string, [string, string]> = {};
  const references = (service: string) => {
    const value = refs[service];
    assert.ok(value);
    return value;
  };
  for (const service of ['game-feedback', 'photo-contest']) {
    release(service, sha);
    const database = service.replaceAll('-', '_');
    const environment = {
      DATABASE_URL: runtimeUrl(database),
      DATABASE_MIGRATION_URL: runtimeUrl(database, true),
      ...(service === 'game-feedback'
        ? {
            ...storage['game-feedback'],
            GAME_FEEDBACK_CONTACT_EMAIL: 'operator@example.test',
            GOOGLE_CLIENT_ID: 'smoke-oauth-client',
            GOOGLE_CLIENT_SECRET: 'smoke-oauth-secret',
            GF_API_BIND_PORT: '0',
          }
        : {
            ...storage['photo-contest'],
          }),
    };
    // 운영 PC 입력의 접두사를 실제 Compose 경계에서 검증한다.
    saveEnv(
      join(root, `services/${service}/.env`),
      service === 'photo-contest'
        ? Object.fromEntries(Object.entries(environment).map(([key, value]) => [`PC_${key}`, value]))
        : environment,
    );
    refs[service] = [reference(service, 'api'), reference(service, 'web')];
  }
  writeFileSync(baseEnv.SIDE_SMOKE_IMAGE_MAP, JSON.stringify(images));
  // A dump that cannot reach the backup bucket stops the first deployment before the DDL role creates any table.
  const refused = spawnSync(
    'bash',
    [
      join(root, `services/game-feedback/releases/${sha}/host/service.sh`),
      'game-feedback',
      'deploy',
      sha,
      ...references('game-feedback'),
    ],
    { env: { ...baseEnv, SIDE_SMOKE_BACKUP_FAIL: '1' }, encoding: 'utf8' },
  );
  assert.notEqual(refused.status, 0, 'A failed backup upload must block deployment');
  assert.equal(existsSync(join(root, 'services/game-feedback/current')), false);
  assert.equal(
    sql(
      'game_feedback',
      "SELECT count(*) FROM information_schema.tables WHERE table_name = '_prisma_migrations'",
    ),
    '0',
  );
  for (const service of ['game-feedback', 'photo-contest']) {
    projects.push(service);
    operate(service, ['deploy', sha, ...references(service)]);
    const receipt = readFileSync(join(root, `services/${service}/releases/${sha}/pg-backup.json`), 'utf8');
    assert.match(
      receipt,
      new RegExp(`"object": "s3://side-smoke-backup/postgres/${service}/\\d{8}T\\d{6}Z-${sha}\\.dump"`),
    );
  }
  run('bash', [join(source, 'scripts/proxy.sh'), 'start']);
  const port = Number(
    compose(`${prefix}-proxy`, proxyFile, ['port', 'proxy', '443']).trim().split(':').at(-1),
  );
  const publicCa = await retry(() =>
    compose(`${prefix}-proxy`, proxyFile, [
      'exec',
      '-T',
      'proxy',
      'cat',
      '/data/caddy/pki/authorities/local/root.crt',
    ]),
  );
  const gf = new Client(gfDomain, port, publicCa);
  const pc = new Client(pcDomain, port, publicCa);
  const gfApi = new Client(gfApiDomain, port, publicCa);
  const pcApi = new Client(pcApiDomain, port, publicCa);
  await retry(async () => assert.equal((await gf.http('/api/health/ready')).status, 200));
  assert.equal((await pc.http('/backend/health/ready')).status, 200);
  assert.equal((await gfApi.http('/api/health/ready')).status, 200);
  assert.equal((await pcApi.http('/health/ready')).status, 200);
  assert.equal((await gfApi.http('/')).status, 404);
  assert.equal((await pcApi.http('/health')).headers['x-robots-tag'], 'noindex, nofollow');
  assert.equal((await gf.http('/health-check/live')).status, 200);
  // Association files were removed from the root environment contract; the callback remains public.
  assert.equal((await gf.http('/.well-known/apple-app-site-association')).status, 404);
  assert.equal((await gf.http('/.well-known/assetlinks.json')).status, 404);
  assert.equal((await gf.http('/app-auth/callback?code=shared-smoke-login-code-0123')).status, 200);
  assert.equal((await pc.http('/health-check/live')).status, 200);
  for (const response of [
    await gf.http('/internal/cache/revalidate'),
    await gf.http('/Internal/cache/revalidate'),
    await gf.http('/api/admin/reports'),
    await pc.post('/backend/testing/users', {}),
    await gf.post('/api/auth/test-token', {}),
    await gfApi.http('/internal/cache/revalidate'),
    await gfApi.http('/internal/visibility/excluded-authors'),
    await gfApi.http('/api/admin/reports'),
    await gfApi.post('/api/auth/test-token', {}),
    await pcApi.post('/testing/users', {}),
  ]) {
    assert.equal(response.status, 404);
    assert.equal(response.text(), 'edge-blocked');
  }
  // Only the /internal segment is reserved; similarly named public paths still reach the app.
  assert.notEqual((await gf.http('/internals-guide')).text(), 'edge-blocked');
  // Keep HTTP polling alive while service.sh performs real same-image replacement.
  const beforeIds = ['game-feedback', 'photo-contest'].map((service) =>
    serviceCompose(service, ['ps', '-q', 'api', 'web']).trim(),
  );
  const availability: {
    running: boolean;
    samples: { endpoint: string; milliseconds: number }[];
    failures: { endpoint: string; milliseconds: number; error: string }[];
  } = { running: true, samples: [], failures: [] };
  const deploymentLogs: { service: string; milliseconds: number; output: string }[] = [];
  const probes = (
    [
      [gf, '/api/health/live'],
      [gf, '/ko'],
      [pc, '/backend/health/live'],
      [pc, '/sign'],
    ] satisfies [Client, string][]
  ).map(async ([client, path]) => {
    while (availability.running) {
      const started = performance.now();
      try {
        const response = await client.http(path);
        assert.equal(response.status, 200, `${client.domain}${path}: ${response.status}`);
        availability.samples.push({
          endpoint: client.domain + path,
          milliseconds: performance.now() - started,
        });
      } catch (error) {
        availability.failures.push({
          endpoint: client.domain + path,
          milliseconds: Math.ceil(performance.now() - started),
          error: String(error),
        });
      }
      await delay(100);
    }
  });
  try {
    await delay(300);
    for (const service of ['game-feedback', 'photo-contest']) {
      const started = performance.now();
      await new Promise<void>((accept, reject) => {
        const child = spawn(
          'bash',
          [
            join(root, `services/${service}/releases/${sha}/host/service.sh`),
            service,
            'deploy',
            sha,
            ...references(service),
          ],
          { env: baseEnv, stdio: ['ignore', 'pipe', 'pipe'] },
        );
        const log = { output: '' };
        child.stdout.on('data', (chunk: Buffer) => {
          log.output = (log.output + chunk).slice(-32768);
        });
        child.stderr.on('data', (chunk: Buffer) => {
          log.output = (log.output + chunk).slice(-32768);
        });
        child.on('error', reject);
        child.on('exit', (code) => {
          deploymentLogs.push({
            service,
            milliseconds: Math.ceil(performance.now() - started),
            output: log.output,
          });
          if (code === 0) return accept();
          reject(new Error(`Redeploy failed: ${log.output}`));
        });
      });
    }
    await delay(300);
  } finally {
    availability.running = false;
    await Promise.all(probes);
    verification.durations = availability.samples.map((sample) => sample.milliseconds);
    verification.failures = availability.failures.length;
  }
  if (availability.failures.length) {
    console.error(
      'Redeploy diagnostics:',
      JSON.stringify({ deploymentLogs, failures: availability.failures }),
    );
    for (const service of ['game-feedback', 'photo-contest'])
      console.error(service, serviceCompose(service, ['logs', '--no-color', '--tail', '60', 'web']));
  }
  assert.deepEqual(availability.failures, [], 'No failed bounded GET probes during replacement');
  for (const [index, service] of ['game-feedback', 'photo-contest'].entries()) {
    const nextIds = serviceCompose(service, ['ps', '-q', 'api', 'web']).trim().split('\n');
    assert.equal(nextIds.length, 2);
    for (const nextId of nextIds)
      assert.ok(!beforeIds[index]?.split('\n').includes(nextId), 'Both containers must actually be replaced');
  }
  assert.equal(new Set(availability.samples.map((sample) => sample.endpoint)).size, 4);
  console.log(
    'Redeploy availability:',
    JSON.stringify({
      samples: availability.samples.length,
      failures: availability.failures.length,
      maxLatencyMs: Math.ceil(Math.max(...availability.samples.map((sample) => sample.milliseconds))),
    }),
  );
  assert.equal(
    sql('game_feedback', "SELECT has_database_privilege('game_feedback','photo_contest','CONNECT')"),
    'f',
  );
  assert.equal(
    sql('photo_contest', "SELECT has_database_privilege('photo_contest','game_feedback','CONNECT')"),
    'f',
  );
  // Only API-side containers join the internal db network; the web tier cannot even resolve the database.
  for (const service of ['game-feedback', 'photo-contest']) {
    const lookup = (app: string) =>
      serviceCompose(service, [
        'exec',
        '-T',
        app,
        'node',
        '-e',
        "require('node:dns').lookup('shared-postgres', (error) => console.log(error ? 'unresolved' : 'resolved'))",
      ]).trim();
    assert.equal(lookup('api'), 'resolved');
    assert.equal(lookup('web'), 'unresolved');
  }
  // The redeploy dumped the migrated schema before touching it; the archive must be restorable.
  const dumps = join(root, 'postgres/dumps/photo-contest');
  const latestDump = readdirSync(dumps)
    .filter((file) => file.endsWith('.dump'))
    .sort()
    .at(-1);
  assert.ok(latestDump, 'Photo Contest must have a pre-migration dump');
  assert.match(
    databaseCompose(['exec', '-T', 'postgres', 'pg_restore', '--list'], {
      input: readFileSync(join(dumps, latestDump)),
    }),
    /_prisma_migrations/,
  );
  assert.equal(
    sql('game_feedback', `SELECT has_table_privilege('game_feedback','"_prisma_migrations"','UPDATE')`),
    'f',
  );
  assert.equal(
    sql('photo_contest', `SELECT has_table_privilege('photo_contest','"_prisma_migrations"','UPDATE')`),
    'f',
  );
  const cookie = await pc.graphql(
    'mutation { registerWithPassword(loginId:"shared_owner",password:"shared smoke password 2026",nickname:"공통 배포 회원") { id } }',
  );
  const setCookie = cookie.headers['set-cookie'];
  assert.ok(setCookie, 'Registration must return a session cookie');
  assert.ok(
    setCookie?.some(
      (value) => value.includes('HttpOnly') && value.includes('Secure') && !/domain=/i.test(value),
    ),
  );
  // A login expires the previous cookie and then sets its replacement, as a browser cookie jar does.
  pc.cookie = [
    ...new Map(
      setCookie.map((value): [string, string] => {
        const [name = '', token = ''] = (value.split(';')[0] ?? '').split('=');
        return [name, token];
      }),
    ).entries(),
  ]
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  const group = (
    await pc.graphql('mutation { createGroup(name:"공통 배포 그룹",visibility:PUBLIC) { id } }')
  ).json(groupResponse);
  const publicPc = new Client(pcDomain, port, publicCa);
  const gatedGroup = await publicPc.http(`/groups/${group.id}`);
  assert.equal(gatedGroup.status, 307, gatedGroup.text());
  const signLocation = new URL(gatedGroup.headers.location ?? '', `https://${pcDomain}`);
  assert.equal(signLocation.pathname, '/sign');
  assert.equal(signLocation.searchParams.get('next'), `/groups/${group.id}`);
  const anonymousSession = await publicPc.graphql('mutation { startAnonymousSession { id } }');
  publicPc.cookie = anonymousSession.headers['set-cookie']
    ?.find((value) => value.startsWith('__Host-contest_session='))
    ?.split(';')[0];
  assert.ok(publicPc.cookie, 'Anonymous browsing requires an HttpOnly session.');
  assert.equal((await publicPc.http(`/groups/${group.id}`)).status, 200);
  // PC는 소셜 로그인과 앱 링크 검증 경로를 제공하지 않는다.
  for (const removedPath of [
    '/.well-known/apple-app-site-association',
    '/.well-known/assetlinks.json',
    '/app-auth/callback?code=shared-smoke-login-code-0123',
  ])
    assert.equal((await publicPc.http(removedPath)).status, 404, `Retired PC route: ${removedPath}`);
  // Photo Contest no longer ships sharp; an 8x8 PNG keeps both services' upload checks real.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGNwav+KFTEMLQkAZI1vgcNLzfoAAAAASUVORK5CYII=',
    'base64',
  );
  const upload = (
    await pc.graphql(
      'mutation($id:ID!,$size:Int!) { requestPostUpload(groupId:$id,contentType:"image/png",byteSize:$size) { id url fields { name value } } }',
      { id: group.id, size: png.length },
    )
  ).json(postUploadResponse);
  assert.equal(
    new URL(upload.url).hostname,
    `${storage['photo-contest'].S3_BUCKET}.s3.ap-northeast-2.amazonaws.com`,
  );
  // Browsers POST the signed form straight to the configured AWS bucket.
  uploadForm('photo-contest', upload, png);
  const completed = await pc.graphql(
    'mutation($id:ID!) { completePostUpload(uploadId:$id) { id byteSize } }',
    {
      id: upload.id,
    },
  );
  assert.deepEqual(completed.json(completedUploadResponse), { id: upload.id, byteSize: png.length });
  pcApi.cookie = pc.cookie;
  const posted = await pcApi.post(
    '/graphql',
    {
      query:
        'mutation($group:ID!,$upload:ID!) { createPost(groupId:$group,uploadId:$upload,title:"S3 파일 보존",rightsConfirmed:true) { id mediaUrl } }',
      variables: { group: group.id, upload: upload.id },
    },
    { Origin: `https://${pcDomain}` },
  );
  assert.equal(posted.status, 200, posted.text());
  assert.equal(posted.json(readObject).errors, undefined, posted.text());
  const post = posted.json(postResponse);
  assert.match((await publicPc.http(`/groups/${group.id}`)).text(), /S3 파일 보존/);
  // The stable media path checks access and redirects to a 60-second signed GET; storage serves Range.
  const redirected = await pc.http(post.mediaUrl, { headers: { Range: 'bytes=0-7' } });
  assert.equal(redirected.status, 307, redirected.text());
  assert.equal(redirected.headers['cache-control'], 'private, no-store');
  assert.ok(redirected.headers.location, 'Media response must include a signed URL');
  const pcSigned = new URL(redirected.headers.location);
  assert.equal(pcSigned.hostname, `${storage['photo-contest'].S3_BUCKET}.s3.ap-northeast-2.amazonaws.com`);
  assert.equal(pcSigned.searchParams.get('X-Amz-Expires'), '60');
  const pcContent = parseJson(
    serviceCompose('photo-contest', [
      'exec',
      '-T',
      'api',
      'node',
      '--input-type=module',
      '-e',
      `const response = await fetch(process.argv[1], {headers: {Range: 'bytes=0-7'}});
       console.log(JSON.stringify({status: response.status, cache: response.headers.get('cache-control'), bytes: Buffer.from(await response.arrayBuffer()).toString('base64')}));`,
      pcSigned.toString(),
    ]),
    signedContentResponse,
  );
  assert.equal(pcContent.status, 206);
  assert.equal(pcContent.cache, 'private, no-store');
  assert.deepEqual(Buffer.from(pcContent.bytes, 'base64'), png.subarray(0, 8));
  await assertAnonymousSession(() => gf.http('/api/session', { headers: { Cookie: pc.cookie } }));
  sql(
    'game_feedback',
    `INSERT INTO "User" (id,nickname,"termsVersion","ageConfirmed") VALUES ('shared-operator','운영 확인','v1',true),('shared-peer','대화 상대','v1',true)`,
  );
  const createdAdmin = parseJson(
    operate('game-feedback', ['operator', 'create', 'smoke-admin'], { input: 'isolated-smoke-password\n' }),
    adminResponse,
  );
  assert.equal(createdAdmin.username, 'smoke-admin');
  assert.notEqual(createdAdmin.userId, 'shared-operator');
  const token = randomBytes(32).toString('base64url');
  sql(
    'game_feedback',
    `INSERT INTO "Session" (id,"tokenHash","userId","expiresAt") VALUES ('shared-public-session','${createHash('sha256').update(token).digest('hex')}','shared-operator',NOW()+INTERVAL '1 hour')`,
  );
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const requestedMedia = await gf.post(
    '/api/post-media/uploads',
    {
      name: 'shared.png',
      mimeType: 'image/png',
      size: png.length,
    },
    { Authorization: `Bearer ${token}` },
  );
  assert.equal(requestedMedia.status, 200, requestedMedia.text());
  const mediaUpload = requestedMedia.json(mediaPlanResponse);
  assert.deepEqual(Object.keys(mediaUpload).sort(), ['expiresAt', 'fields', 'id', 'url']);
  assert.equal(
    new URL(mediaUpload.url).hostname,
    `${storage['game-feedback'].GF_S3_BUCKET}.s3.ap-northeast-2.amazonaws.com`,
  );
  uploadForm('game-feedback', mediaUpload, png);
  const mediaResponse = await gf.post(
    `/api/post-media/${mediaUpload.id}/complete`,
    {},
    { Authorization: `Bearer ${token}` },
  );
  assert.equal(mediaResponse.status, 200, mediaResponse.text());
  const media = mediaResponse.json(decodeMediaResponse);
  assert.equal((await gf.http(media.url)).status, 404);
  const signed = await gf.http(media.url, {
    headers: { Authorization: `Bearer ${token}`, Range: 'bytes=0-7' },
  });
  assert.equal(signed.status, 307, signed.text());
  assert.equal(signed.headers['cache-control'], 'private, no-store');
  assert.ok(signed.headers.location, 'Media response must include a signed URL');
  const signedUrl = new URL(signed.headers.location);
  assert.equal(
    signedUrl.hostname,
    `${storage['game-feedback'].GF_S3_BUCKET}.s3.ap-northeast-2.amazonaws.com`,
  );
  assert.equal(signedUrl.searchParams.get('X-Amz-Expires'), '60');
  // API 컨테이너에서 실제 S3를 읽으며 서비스 인증은 전달하지 않는다.
  const content = parseJson(
    serviceCompose('game-feedback', [
      'exec',
      '-T',
      'api',
      'node',
      '--input-type=module',
      '-e',
      `const response = await fetch(process.argv[1], {headers: {Range: 'bytes=0-7'}});
       console.log(JSON.stringify({status: response.status, cache: response.headers.get('cache-control'), bytes: Buffer.from(await response.arrayBuffer()).toString('base64')}));`,
      signedUrl.toString(),
    ]),
    signedContentResponse,
  );
  assert.equal(content.status, 206);
  assert.equal(content.cache, 'private, no-store');
  assert.deepEqual(Buffer.from(content.bytes, 'base64'), png.subarray(0, 8));
  assert.equal(
    sql('game_feedback', 'SELECT count(*) FROM "PostMedia" WHERE bytes IS NULL AND "objectId" IS NOT NULL'),
    '1',
  );
  const conversation = await gf.post(
    '/api/conversations',
    { recipientId: 'shared-peer' },
    { Authorization: `Bearer ${token}` },
  );
  assert.equal(conversation.status, 200, conversation.text());
  const stream = await gf.open('/api/chat/events', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(stream.statusCode, 200);
  const events = new EventReader(stream);
  assert.deepEqual(await events.invalidate(), { conversationId: null });
  stream.destroy();
  const pcId = serviceCompose('photo-contest', ['ps', '-q', 'api']).trim();
  const proxyId = compose(`${prefix}-proxy`, proxyFile, ['ps', '-q', 'proxy']).trim();
  const rewritten = spawnSync(
    'bash',
    [
      join(root, `services/game-feedback/releases/${sha}/host/service.sh`),
      'game-feedback',
      'deploy',
      sha,
      references('game-feedback')[0],
      `ghcr.io/jingeon27/side-project-game-feedback-web@sha256:${'f'.repeat(64)}`,
    ],
    { encoding: 'utf8', env: baseEnv },
  );
  assert.notEqual(rewritten.status, 0);
  assert.match(rewritten.stderr, /protected release/);
  const badSha = randomBytes(20).toString('hex');
  release('game-feedback', badSha);
  const stale = spawnSync(
    'bash',
    [
      join(root, `services/game-feedback/releases/${sha}/host/service.sh`),
      'game-feedback',
      'deploy',
      badSha,
      ...references('game-feedback'),
    ],
    { encoding: 'utf8', env: { ...baseEnv, SIDE_SMOKE_BACKUP_FAIL: '1' } },
  );
  assert.notEqual(
    stale.status,
    0,
    'A failed backup upload must block migrations and application replacement',
  );
  assert.equal(
    readlinkSync(join(root, 'services/game-feedback/current')),
    join(root, `services/game-feedback/releases/${sha}`),
  );
  const broken = `${prefix}-broken-web:local`;
  createdImages.push(broken);
  run('docker', ['build', '--builder', 'default', '--platform', 'linux/amd64', '--tag', broken, '-'], {
    input: `FROM side-shared-gf-web:${sha}\nCMD ["node","-e","process.exit(1)"]\n`,
  });
  const brokenRef = `ghcr.io/jingeon27/side-project-game-feedback-web@sha256:${'b'.repeat(64)}`;
  images[brokenRef] = broken;
  writeFileSync(baseEnv.SIDE_SMOKE_IMAGE_MAP, JSON.stringify(images));
  const failed = spawnSync(
    'bash',
    [
      join(root, `services/game-feedback/releases/${sha}/host/service.sh`),
      'game-feedback',
      'deploy',
      badSha,
      references('game-feedback')[0],
      brokenRef,
    ],
    { encoding: 'utf8', env: { ...baseEnv, SIDE_WAIT_SECONDS: '35' } },
  );
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /Previous application images restored/);
  assert.equal(serviceCompose('photo-contest', ['ps', '-q', 'api']).trim(), pcId);
  assert.equal(compose(`${prefix}-proxy`, proxyFile, ['ps', '-q', 'proxy']).trim(), proxyId);
  assert.equal((await pc.http(post.mediaUrl)).status, 307);
  // A rolling application restart closes its process-local SSE connections; clients reconnect.
  const reconnected = await gf.open('/api/chat/events', { headers: { Authorization: `Bearer ${token}` } });
  const resumed = new EventReader(reconnected);
  assert.deepEqual(await resumed.invalidate(), { conversationId: null });
  const next = resumed.invalidate();
  const sent = await gf.post(
    `/api/conversations/${conversation.json(conversationResponse).id}/messages`,
    { body: '공통 프록시 SSE 확인', clientMessageId: randomUUID() },
    { Authorization: `Bearer ${token}` },
  );
  assert.equal(sent.status, 200, sent.text());
  assert.equal(
    (
      await Promise.race([
        next,
        delay(10000).then(() => {
          throw new Error('SSE invalidation timed out');
        }),
      ])
    ).conversationId,
    conversation.json(conversationResponse).id,
  );
  reconnected.destroy();
  serviceCompose('photo-contest', ['restart', 'api', 'web']);
  serviceCompose('photo-contest', ['up', '-d', '--wait', 'api', 'web']);
  assert.equal((await pc.http(post.mediaUrl)).status, 307);
  for (const service of ['game-feedback', 'photo-contest'] as const) measureDatabaseRestore({ service });
  databaseCompose(['stop', 'postgres']);
  assert.equal((await gf.http('/api/health/live')).status, 200);
  assert.equal((await pc.http('/backend/health/live')).status, 200);
  assert.equal((await gf.http('/api/health/ready')).status, 503);
  assert.equal((await pc.http('/backend/health/ready')).status, 503);
  assert.equal((await gf.http('/health-check/live')).status, 200);
  assert.equal((await pc.http('/health-check/live')).status, 200);
  run('bash', [join(source, 'scripts/database.sh'), 'start']);
  verification.complete = true;
  console.log(
    'Shared-instance smoke passed: two real apps, one HTTPS proxy, the host database on internal networks only, separate DML/DDL roles and service S3 folders, pre-migration dumps, presigned POST/S3 Range, secure host-only cookies, SSE, failed-backup refusal, isolated failed-deploy rollback, restart persistence and liveness/readiness separation.',
  );
} finally {
  for (const service of ['game-feedback', 'photo-contest']) {
    try {
      if (!serviceCompose(service, ['ps', '-q', 'api']).trim()) continue;
      checkStorage(service, true);
    } catch {
      cleanupState.failed = true;
      console.error(
        `Real S3 cleanup failed for ${service}; inspect this run's tests/${storageRunId}/ prefix.`,
      );
    }
  }
  for (const project of [...projects].reverse()) {
    try {
      if (project === 'proxy')
        compose(`${prefix}-proxy`, proxyFile, ['down', '--volumes', '--remove-orphans']);
      if (project === 'database') {
        databaseCompose(['down', '--remove-orphans']);
        // The cluster files belong to the container's postgres user; only a container can remove them.
        databaseCompose([
          'run',
          '--rm',
          '--no-deps',
          '--entrypoint',
          'rm',
          'postgres',
          '-rf',
          '/var/lib/postgresql/18',
        ]);
      }
      if (['game-feedback', 'photo-contest'].includes(project))
        serviceCompose(project, ['down', '--remove-orphans']);
    } catch {
      cleanupState.failed = true;
      console.error(`Cleanup required for owned test project: ${prefix}-${project}`);
    }
  }
  for (const service of ['game-feedback', 'photo-contest'])
    for (const network of ['edge', 'db'])
      spawnSync(realDocker, ['network', 'rm', `${prefix}-${service}-${network}`], {
        env: baseEnv,
        stdio: 'ignore',
      });
  for (const image of createdImages)
    spawnSync(realDocker, ['image', 'rm', image], { env: baseEnv, stdio: 'ignore' });
  if (!cleanupState.failed) rmSync(root, { recursive: true });
  const evidence = verificationEvidence({
    revision: sha,
    ...verification,
    complete: verification.complete && !cleanupState.failed,
  });
  writeFileSync(
    join(scratch, 'shared-instance-verification.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
    { mode: 0o600 },
  );
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = evidence.restores.map(
      (restore) =>
        `| ${restore.service} | ${restore.databaseRestoreMs} | ${restore.verifiedTables} | ${restore.verifiedRows} |`,
    );
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        '## Isolated container recovery verification',
        '',
        `Result: ${evidence.status}. Production RTO/RPO was not measured.`,
        '',
        '| Service | DB restore and verification ms | Tables | Rows |',
        '| --- | ---: | ---: | ---: |',
        ...rows,
        '',
        `Replacement probes: ${evidence.replacement.latency?.count ?? 0}; failures: ${evidence.replacement.failures}; p95: ${evidence.replacement.latency?.p95Ms ?? 'unavailable'} ms.`,
        '',
      ].join('\n'),
    );
  }
  if (cleanupState.failed) process.exitCode = 1;
}
