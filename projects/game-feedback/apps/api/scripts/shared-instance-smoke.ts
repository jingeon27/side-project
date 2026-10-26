import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
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
import { request } from 'node:https';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { assertAnonymousSession } from './shared-instance/session-check.mjs';

// API-owned integration runner. RDS/registry/S3 boundaries are isolated fixtures, not AWS resources.
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../../..');
const source = join(repo, 'deploy/shared-instance');
const [, , sha] = process.argv;
assert.match(sha ?? '', /^[a-f0-9]{40}$/);
const id = randomBytes(5).toString('hex');
const prefix = `side-shared-smoke-${id}`;
const scratch = join(repo, 'projects/game-feedback/.data');
mkdirSync(scratch, { recursive: true });
const root = mkdtempSync(join(scratch, 'shared-instance-'));
const host = 'side.abcdef.ap-northeast-2.rds.amazonaws.com';
const gfDomain = 'game.bambyul.com';
const pcDomain = 'contest.bambyul.com';
const gfApiDomain = `api.${gfDomain}`;
const pcApiDomain = `api.${pcDomain}`;
const realDocker = spawnSync('sh', ['-c', 'command -v docker'], { encoding: 'utf8' }).stdout.trim();
const baseEnv = {
  ...process.env,
  SIDE_DEPLOY_ROOT: root,
  SIDE_PROJECT_PREFIX: prefix,
  SIDE_NETWORK_PREFIX: prefix,
  SIDE_LOCAL_IMAGES: '1',
  SIDE_REAL_DOCKER: realDocker,
  SIDE_SMOKE_IMAGE_MAP: join(root, 'images.json'),
};
const images = {};
const createdImages = [];
const password = randomBytes(32).toString('hex');
const schemaPassword = randomBytes(32).toString('hex');
const proxyEnv = {
  GAME_FEEDBACK_DOMAIN: gfDomain,
  GAME_FEEDBACK_API_DOMAIN: gfApiDomain,
  PHOTO_CONTEST_DOMAIN: pcDomain,
  PHOTO_CONTEST_API_DOMAIN: pcApiDomain,
  ACME_EMAIL: 'operator@example.test',
  RDS_REGION: 'ap-northeast-2',
  RDS_INSTANCE_ID: 'side-smoke',
  RDS_HOST: host,
  GAME_FEEDBACK_S3_BUCKET: 'gf-smoke-private',
  PHOTO_CONTEST_S3_BUCKET: 'pc-smoke-private',
  SIDE_BIND_ADDRESS: '127.0.0.1',
  SIDE_HTTP_PORT: '0',
  SIDE_HTTPS_PORT: '0',
};
const projects = [];
const cleanupState = { failed: false };

function run(binary, args, options = {}) {
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
function saveEnv(file, values) {
  writeFileSync(
    file,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
    { mode: 0o600 },
  );
}
function compose(project, file, args) {
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
const dependenciesFile = join(root, 'dependencies.json');
function dependency(args) {
  return compose(`${prefix}-dependencies`, dependenciesFile, args);
}
function serviceCompose(service, args, revision = sha) {
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
function uploadForm(service, upload, bytes) {
  const fields = Array.isArray(upload.fields)
    ? upload.fields
    : Object.entries(upload.fields).map(([name, value]) => ({ name, value }));
  const stored = JSON.parse(
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
  );
  assert.equal(stored.status, 204, stored.body);
}
function sql(database, text) {
  return dependency([
    'exec',
    '-T',
    'db',
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
function release(service, revision) {
  const directory = join(root, `services/${service}/releases/${revision}`);
  mkdirSync(directory, { recursive: true });
  const file = readFileSync(join(repo, `projects/${service}/deploy/shared-instance/compose.yaml`), 'utf8');
  writeFileSync(
    join(directory, 'compose.yaml'),
    file.replace(
      '\n  NODE_ENV: production',
      '\n  NODE_ENV: production\n  NODE_EXTRA_CA_CERTS: /run/rds/ca.pem',
    ),
  );
  mkdirSync(join(directory, 'host'));
  readdirSync(join(source, 'scripts')).forEach((file) =>
    cpSync(join(source, 'scripts', file), join(directory, 'host', file)),
  );
  return directory;
}
function operate(service, args, options) {
  return run(
    'bash',
    [join(root, `services/${service}/releases/${sha}/host/service.sh`), service, ...args],
    options,
  );
}
function reference(service, app) {
  const tag = `side-shared-${service === 'game-feedback' ? 'gf' : 'pc'}-${app}:${sha}`;
  const image = run('docker', ['image', 'inspect', '--format', '{{.Id}}', tag]).trim();
  const ref = `ghcr.io/jingeon27/side-project-${service}-${app}@sha256:${createHash('sha256').update(image).digest('hex')}`;
  images[ref] = tag;
  return ref;
}
async function retry(fn, left = 30) {
  try {
    return await fn();
  } catch (error) {
    if (left === 0) throw error;
    await delay(300);
    return retry(fn, left - 1);
  }
}
class Client {
  cookie = '';
  constructor(domain, port, ca) {
    this.domain = domain;
    this.port = port;
    this.ca = ca;
  }
  open(path, { method = 'GET', headers, body } = {}) {
    return new Promise((accept, reject) => {
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
  async http(path, options) {
    const response = await this.open(path, options);
    const chunks = [];
    for await (const chunk of response) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    return {
      status: response.statusCode,
      headers: response.headers,
      body,
      text: () => body.toString(),
      json: () => JSON.parse(body.toString()),
    };
  }
  post(path, data, headers) {
    return this.http(path, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }
  async graphql(query, variables = {}) {
    const response = await this.post('/backend/graphql', { query, variables });
    assert.equal(response.status, 200, response.text());
    assert.equal(response.json().errors, undefined, response.text());
    return response;
  }
}

class EventReader {
  buffer = '';
  constructor(stream) {
    this.iterator = stream[Symbol.asyncIterator]();
  }
  async invalidate() {
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
      return JSON.parse(lines.find((line) => line.startsWith('data:')).slice(5));
    }
    const chunk = await this.iterator.next();
    assert.equal(chunk.done, false, 'SSE ended before invalidation');
    this.buffer += chunk.value.toString().replaceAll('\r\n', '\n');
    return this.invalidate();
  }
}

try {
  mkdirSync(join(root, 'certs'));
  mkdirSync(join(root, 'bin'));
  mkdirSync(join(root, 'proxy'));
  saveEnv(join(root, '.env'), proxyEnv);
  writeFileSync(baseEnv.SIDE_SMOKE_IMAGE_MAP, '{}');
  cpSync(join(source, 'compose.yaml'), proxyFile);
  writeFileSync(
    join(root, 'proxy/Caddyfile'),
    readFileSync(join(source, 'Caddyfile'), 'utf8').replace('{\n', '{\n\tlocal_certs\n'),
  );
  cpSync(join(here, 'shared-instance/docker-fixture.py'), join(root, 'bin/docker'));
  run('chmod', ['700', join(root, 'bin/docker')]);
  const ca = join(root, 'certs/rds-ca.pem');
  run('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '1',
    '-subj',
    '/CN=Shared smoke CA',
    '-keyout',
    join(root, 'certs/ca.key'),
    '-out',
    ca,
  ]);
  run('openssl', [
    'req',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-subj',
    `/CN=${host}`,
    '-keyout',
    join(root, 'certs/server.key'),
    '-out',
    join(root, 'certs/server.csr'),
  ]);
  writeFileSync(
    join(root, 'certs/extensions'),
    `subjectAltName=DNS:${host},DNS:gf-smoke-private.s3.ap-northeast-2.amazonaws.com,DNS:pc-smoke-private.s3.ap-northeast-2.amazonaws.com\n`,
  );
  run('openssl', [
    'x509',
    '-req',
    '-days',
    '1',
    '-in',
    join(root, 'certs/server.csr'),
    '-CA',
    ca,
    '-CAkey',
    join(root, 'certs/ca.key'),
    '-CAcreateserial',
    '-extfile',
    join(root, 'certs/extensions'),
    '-out',
    join(root, 'certs/server.crt'),
  ]);
  projects.push('proxy');
  run('bash', [join(source, 'scripts/proxy.sh'), 'validate']);
  baseEnv.PATH = `${root}/bin:${process.env.PATH}`;
  const init = readFileSync(join(source, 'rds-bootstrap.sql'), 'utf8').replace(
    /^\\password (\w+)$/gm,
    (_, role) => `ALTER ROLE ${role} PASSWORD '${role.endsWith('_migrator') ? schemaPassword : password}';`,
  );
  writeFileSync(join(root, 'init.sql'), init);
  cpSync(join(here, 'shared-instance/object-storage.mjs'), join(root, 'object-storage.mjs'));
  writeFileSync(
    dependenciesFile,
    JSON.stringify({
      services: {
        db: {
          image: 'postgres:18-bookworm',
          environment: { POSTGRES_PASSWORD: randomBytes(32).toString('hex') },
          entrypoint: [
            'bash',
            '-ceu',
            'install -d -m 700 -o postgres -g postgres /tmp/certs; cp /certs/server.* /tmp/certs/; chown postgres:postgres /tmp/certs/*; chmod 600 /tmp/certs/*; exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/certs/server.crt -c ssl_key_file=/tmp/certs/server.key',
          ],
          volumes: [
            'data:/var/lib/postgresql',
            `${root}/certs:/certs:ro`,
            `${root}/init.sql:/docker-entrypoint-initdb.d/10-shared.sql:ro`,
          ],
          networks: { gf: { aliases: [host] }, pc: { aliases: [host] } },
          healthcheck: {
            test: ['CMD-SHELL', 'pg_isready -U postgres -d photo_contest'],
            interval: '3s',
            timeout: '3s',
            retries: 30,
          },
        },
        storage: {
          image: 'node:24-bookworm-slim',
          command: ['node', '/fixture/object-storage.mjs'],
          volumes: [`${root}/certs:/certs:ro`, `${root}/object-storage.mjs:/fixture/object-storage.mjs:ro`],
          networks: {
            gf: { aliases: ['gf-smoke-private.s3.ap-northeast-2.amazonaws.com'] },
            pc: { aliases: ['pc-smoke-private.s3.ap-northeast-2.amazonaws.com'] },
          },
        },
      },
      networks: {
        gf: { external: true, name: `${prefix}-game-feedback-edge` },
        pc: { external: true, name: `${prefix}-photo-contest-edge` },
      },
      volumes: { data: {} },
    }),
  );
  projects.push('dependencies');
  dependency(['up', '-d', '--wait', '--wait-timeout', '120']);
  const runtimeUrl = (database, migration = false) =>
    `postgresql://${database}${migration ? '_migrator' : ''}:${migration ? schemaPassword : password}@${host}:5432/${database}?schema=public&sslmode=require&sslaccept=strict&sslcert=/run/rds/ca.pem&connection_limit=${migration ? 2 : 5}&pool_timeout=10&connect_timeout=5`;
  const refs = {};
  for (const service of ['game-feedback', 'photo-contest']) {
    release(service, sha);
    const database = service.replaceAll('-', '_');
    const environment = {
      DATABASE_URL: runtimeUrl(database),
      DATABASE_MIGRATION_URL: runtimeUrl(database, true),
      ...(service === 'game-feedback'
        ? {
            GF_S3_ACCESS_KEY_ID: 'gf-smoke-access',
            GF_S3_SECRET_ACCESS_KEY: 'gf-private-secret',
            GAME_FEEDBACK_CONTACT_EMAIL: 'operator@example.test',
            GF_S3_BUCKET: 'gf-smoke-private',
            GOOGLE_CLIENT_ID: 'smoke-oauth-client',
            GOOGLE_CLIENT_SECRET: 'smoke-oauth-secret',
            GF_API_BIND_PORT: '0',
          }
        : {
            S3_BUCKET: 'pc-smoke-private',
            AWS_ACCESS_KEY_ID: 'pc-smoke-access',
            AWS_SECRET_ACCESS_KEY: 'pc-private-secret',
          }),
    };
    saveEnv(join(root, `services/${service}/.env`), environment);
    refs[service] = [reference(service, 'api'), reference(service, 'web')];
  }
  writeFileSync(baseEnv.SIDE_SMOKE_IMAGE_MAP, JSON.stringify(images));
  const validCa = readFileSync(ca);
  run('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '1',
    '-subj',
    '/CN=Wrong CA',
    '-keyout',
    join(root, 'certs/wrong.key'),
    '-out',
    join(root, 'certs/wrong.pem'),
  ]);
  writeFileSync(ca, readFileSync(join(root, 'certs/wrong.pem')));
  try {
    const rejected = spawnSync(
      'bash',
      [
        join(root, `services/game-feedback/releases/${sha}/host/service.sh`),
        'game-feedback',
        'deploy',
        sha,
        ...refs['game-feedback'],
      ],
      { env: baseEnv, encoding: 'utf8' },
    );
    assert.notEqual(rejected.status, 0, 'An untrusted database CA must block deployment');
    assert.equal(existsSync(join(root, 'services/game-feedback/current')), false);
    assert.equal(
      sql(
        'game_feedback',
        "SELECT count(*) FROM information_schema.tables WHERE table_name = '_prisma_migrations'",
      ),
      '0',
    );
  } finally {
    writeFileSync(ca, validCa);
  }
  for (const service of ['game-feedback', 'photo-contest']) {
    projects.push(service);
    operate(service, ['deploy', sha, ...refs[service]]);
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
  const availability = { running: true, samples: [], failures: [] };
  const deploymentLogs = [];
  const probes = [
    [gf, '/api/health/live'],
    [gf, '/ko'],
    [pc, '/backend/health/live'],
    [pc, '/sign'],
  ].map(async ([client, path]) => {
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
      await new Promise((accept, reject) => {
        const child = spawn(
          'bash',
          [
            join(root, `services/${service}/releases/${sha}/host/service.sh`),
            service,
            'deploy',
            sha,
            ...refs[service],
          ],
          { env: baseEnv, stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let output = '';
        child.stdout.on('data', (chunk) => {
          output = (output + chunk).slice(-32768);
        });
        child.stderr.on('data', (chunk) => {
          output = (output + chunk).slice(-32768);
        });
        child.on('error', reject);
        child.on('exit', (code) => {
          deploymentLogs.push({ service, milliseconds: Math.ceil(performance.now() - started), output });
          if (code === 0) return accept();
          reject(new Error(`Redeploy failed: ${output}`));
        });
      });
    }
    await delay(300);
  } finally {
    availability.running = false;
    await Promise.all(probes);
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
      assert.ok(!beforeIds[index].split('\n').includes(nextId), 'Both containers must actually be replaced');
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
  const tls = sql(
    'game_feedback',
    "SELECT bool_and(ssl) FROM pg_stat_ssl JOIN pg_stat_activity USING(pid) WHERE usename IN ('game_feedback','photo_contest')",
  );
  assert.equal(tls, 't');
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
  assert.ok(
    setCookie?.some(
      (value) => value.includes('HttpOnly') && value.includes('Secure') && !/domain=/i.test(value),
    ),
  );
  // A login expires the previous cookie and then sets its replacement, as a browser cookie jar does.
  pc.cookie = [...new Map(setCookie.map((value) => value.split(';')[0].split('='))).entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  const group = (
    await pc.graphql('mutation { createGroup(name:"공통 배포 그룹",visibility:PUBLIC) { id } }')
  ).json().data.createGroup;
  const publicPc = new Client(pcDomain, port, publicCa);
  const gatedGroup = await publicPc.http(`/groups/${group.id}`);
  assert.equal(gatedGroup.status, 307, gatedGroup.text());
  const signLocation = new URL(gatedGroup.headers.location, `https://${pcDomain}`);
  assert.equal(signLocation.pathname, '/sign');
  assert.equal(signLocation.searchParams.get('next'), `/groups/${group.id}`);
  const anonymousSession = await publicPc.graphql('mutation { startAnonymousSession { id } }');
  publicPc.cookie = anonymousSession.headers['set-cookie']
    ?.find((value) => value.startsWith('__Host-contest_session='))
    ?.split(';')[0];
  assert.ok(publicPc.cookie, 'Anonymous browsing requires an HttpOnly session.');
  assert.equal((await publicPc.http(`/groups/${group.id}`)).status, 200);
  // Both services currently omit native association files while preserving the login callback.
  assert.equal((await publicPc.http('/.well-known/apple-app-site-association')).status, 404);
  assert.equal((await publicPc.http('/.well-known/assetlinks.json')).status, 404);
  const appCallback = await publicPc.http('/app-auth/callback?code=shared-smoke-login-code-0123');
  assert.equal(appCallback.status, 200);
  assert.equal(appCallback.headers['cache-control'], 'no-store');
  assert.equal(appCallback.text().includes('shared-smoke-login-code'), false);
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
  ).json().data.requestPostUpload;
  assert.equal(new URL(upload.url).hostname, 'pc-smoke-private.s3.ap-northeast-2.amazonaws.com');
  // Browsers POST the signed form straight to the bucket; the host resolves the bucket alias only on the service network.
  uploadForm('photo-contest', upload, png);
  const completed = await pc.graphql(
    'mutation($id:ID!) { completePostUpload(uploadId:$id) { id byteSize } }',
    {
      id: upload.id,
    },
  );
  assert.deepEqual(completed.json().data.completePostUpload, { id: upload.id, byteSize: png.length });
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
  assert.equal(posted.json().errors, undefined, posted.text());
  const post = posted.json().data.createPost;
  assert.match((await publicPc.http(`/groups/${group.id}`)).text(), /S3 파일 보존/);
  // The stable media path checks access and redirects to a 60-second signed GET; storage serves Range.
  const redirected = await pc.http(post.mediaUrl, { headers: { Range: 'bytes=0-7' } });
  assert.equal(redirected.status, 307, redirected.text());
  assert.equal(redirected.headers['cache-control'], 'private, no-store');
  const pcSigned = new URL(redirected.headers.location);
  assert.equal(pcSigned.hostname, 'pc-smoke-private.s3.ap-northeast-2.amazonaws.com');
  assert.equal(pcSigned.searchParams.get('X-Amz-Expires'), '60');
  const pcContent = JSON.parse(
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
  );
  assert.equal(pcContent.status, 206);
  assert.equal(pcContent.cache, 'private, no-store');
  assert.deepEqual(Buffer.from(pcContent.bytes, 'base64'), png.subarray(0, 8));
  await assertAnonymousSession(() => gf.http('/api/session', { headers: { Cookie: pc.cookie } }));
  sql(
    'game_feedback',
    `INSERT INTO "User" (id,nickname,"termsVersion","ageConfirmed") VALUES ('shared-operator','운영 확인','v1',true),('shared-peer','대화 상대','v1',true)`,
  );
  const createdAdmin = JSON.parse(
    operate('game-feedback', ['operator', 'create', 'smoke-admin'], { input: 'isolated-smoke-password\n' }),
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
  const mediaUpload = requestedMedia.json();
  assert.deepEqual(Object.keys(mediaUpload).sort(), ['expiresAt', 'fields', 'id', 'url']);
  assert.equal(new URL(mediaUpload.url).hostname, 'gf-smoke-private.s3.ap-northeast-2.amazonaws.com');
  uploadForm('game-feedback', mediaUpload, png);
  const mediaResponse = await gf.post(
    `/api/post-media/${mediaUpload.id}/complete`,
    {},
    { Authorization: `Bearer ${token}` },
  );
  assert.equal(mediaResponse.status, 200, mediaResponse.text());
  const media = mediaResponse.json();
  assert.equal((await gf.http(media.url)).status, 404);
  const signed = await gf.http(media.url, {
    headers: { Authorization: `Bearer ${token}`, Range: 'bytes=0-7' },
  });
  assert.equal(signed.status, 307, signed.text());
  assert.equal(signed.headers['cache-control'], 'private, no-store');
  const signedUrl = new URL(signed.headers.location);
  assert.equal(signedUrl.hostname, 'gf-smoke-private.s3.ap-northeast-2.amazonaws.com');
  assert.equal(signedUrl.searchParams.get('X-Amz-Expires'), '60');
  // API 컨테이너의 격리 네트워크에서 S3 fixture를 읽으며 서비스 인증은 전달하지 않는다.
  const content = JSON.parse(
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
      refs['game-feedback'][0],
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
      ...refs['game-feedback'],
    ],
    { encoding: 'utf8', env: { ...baseEnv, SIDE_SMOKE_NO_PITR: '1' } },
  );
  assert.notEqual(stale.status, 0, 'Stale PITR must block migrations and application replacement');
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
      refs['game-feedback'][0],
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
    `/api/conversations/${conversation.json().id}/messages`,
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
    conversation.json().id,
  );
  reconnected.destroy();
  serviceCompose('photo-contest', ['restart', 'api', 'web']);
  serviceCompose('photo-contest', ['up', '-d', '--wait', 'api', 'web']);
  assert.equal((await pc.http(post.mediaUrl)).status, 307);
  dependency(['stop', 'db']);
  assert.equal((await gf.http('/api/health/live')).status, 200);
  assert.equal((await pc.http('/backend/health/live')).status, 200);
  assert.equal((await gf.http('/api/health/ready')).status, 503);
  assert.equal((await pc.http('/backend/health/ready')).status, 503);
  assert.equal((await gf.http('/health-check/live')).status, 200);
  assert.equal((await pc.http('/health-check/live')).status, 200);
  dependency(['up', '-d', '--wait', '--wait-timeout', '120', 'db']);
  console.log(
    'Shared-instance smoke passed: two real apps, one HTTPS proxy, verified database TLS, separate DML/DDL roles and buckets, presigned POST/S3 Range, secure host-only cookies, SSE, stale-PITR refusal, isolated failed-deploy rollback, restart persistence and liveness/readiness separation.',
  );
} finally {
  for (const project of projects.toReversed()) {
    try {
      if (project === 'proxy')
        compose(`${prefix}-proxy`, proxyFile, ['down', '--volumes', '--remove-orphans']);
      if (project === 'dependencies') dependency(['down', '--volumes', '--remove-orphans']);
      if (['game-feedback', 'photo-contest'].includes(project))
        serviceCompose(project, ['down', '--remove-orphans']);
    } catch {
      cleanupState.failed = true;
      console.error(`Cleanup required for owned test project: ${prefix}-${project}`);
    }
  }
  for (const service of ['game-feedback', 'photo-contest'])
    spawnSync(realDocker, ['network', 'rm', `${prefix}-${service}-edge`], { env: baseEnv, stdio: 'ignore' });
  for (const image of createdImages)
    spawnSync(realDocker, ['image', 'rm', image], { env: baseEnv, stdio: 'ignore' });
  if (!cleanupState.failed) rmSync(root, { recursive: true });
}
