import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// No development server, existing database, real OAuth provider or AWS resource is used.
const project = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const deployment = join(project, 'deploy/lightsail');
const sha = process.env.GF_SMOKE_TAG;
assert.match(sha ?? '', /^[a-f0-9]{40}$/);
const imagePrefix = process.env.GF_SMOKE_IMAGE_PREFIX ?? 'game-feedback-ci';
const domain = process.env.GF_SMOKE_DOMAIN ?? 'game-feedback.test';
assert.match(domain, /^[a-z0-9.-]+$/);
mkdirSync(join(project, '.data'), { recursive: true });
const root = mkdtempSync(join(project, '.data/production-smoke-'));
const stacks = [];
const temporaryImages = [];

function command(binary, args, options = {}) {
  const result = spawnSync(binary, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, ...options });
  if (result.status !== 0) {
    // Never include arguments (operator credentials) or environment in errors.
    throw new Error(`${binary} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

class Stack {
  constructor(name) {
    this.name = `game-feedback-smoke-${randomBytes(5).toString('hex')}`;
    this.directory = join(root, name);
    this.release = join(this.directory, 'releases', sha);
    mkdirSync(this.release, { recursive: true });
    ['ops.sh', 'compose.yaml', 'Caddyfile', 'init-db.sh'].forEach((file) =>
      cpSync(join(deployment, file), join(this.release, file)),
    );
    const caddy = join(this.release, 'Caddyfile');
    writeFileSync(caddy, readFileSync(caddy, 'utf8').replace('{\n', '{\n\tlocal_certs\n'));
    writeFileSync(
      join(this.directory, '.env'),
      [
        `GF_DOMAIN=${domain}`,
        'GF_CONTACT_EMAIL=operator@game-feedback.test',
        `GF_IMAGE_PREFIX=${imagePrefix}`,
        `GF_DB_PASSWORD=${randomBytes(32).toString('hex')}`,
        `GF_DB_ADMIN_PASSWORD=${randomBytes(32).toString('hex')}`,
        'GOOGLE_CLIENT_ID=isolated-smoke-client',
        'GOOGLE_CLIENT_SECRET=isolated-smoke-secret',
        'GF_BIND_ADDRESS=127.0.0.1',
        'GF_API_BIND_PORT=0',
        'GF_HTTP_BIND_PORT=0',
        'GF_HTTPS_BIND_PORT=0',
      ].join('\n') + '\n',
      { mode: 0o600 },
    );
    this.env = {
      ...process.env,
      GF_DEPLOY_ROOT: this.directory,
      GF_STACK_NAME: this.name,
      GF_IMAGE_TAG: sha,
      GF_DEPLOY_LOCAL_IMAGES: '1',
      GF_WAIT_SECONDS: '120',
    };
    stacks.push(this);
  }
  compose(args, options) {
    return command(
      'docker',
      [
        'compose',
        '--project-name',
        this.name,
        '--env-file',
        join(this.directory, '.env'),
        '--file',
        join(this.release, 'compose.yaml'),
        ...args,
      ],
      { env: this.env, ...options },
    );
  }
  ops(args, options) {
    return command('bash', [join(this.release, 'ops.sh'), ...args], { env: this.env, ...options });
  }
  sql(sql) {
    return this.compose(
      [
        'exec',
        '-T',
        'db',
        'psql',
        '-U',
        'game_feedback',
        '-d',
        'game_feedback',
        '-XAt',
        '-v',
        'ON_ERROR_STOP=1',
      ],
      { input: sql },
    ).trim();
  }
  connect() {
    this.port = Number(this.compose(['port', 'proxy', '443']).trim().split(':').at(-1));
    this.ca = this.compose(['exec', '-T', 'proxy', 'cat', '/data/caddy/pki/authorities/local/root.crt']);
  }
  open(path, { method = 'GET', token, headers, body } = {}) {
    return new Promise((accept, reject) => {
      const req = request(
        {
          hostname: '127.0.0.1',
          port: this.port,
          servername: domain,
          ca: this.ca,
          path,
          method,
          headers: {
            Host: domain,
            Origin: `https://${domain}`,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...headers,
          },
        },
        accept,
      );
      req.on('error', reject);
      req.setTimeout(15000, () => req.destroy(new Error('HTTPS smoke request timed out')));
      req.end(body);
    });
  }
  async http(path, options) {
    const response = await this.open(path, options);
    const bytes = [];
    for await (const chunk of response) bytes.push(chunk);
    const body = Buffer.concat(bytes);
    return {
      status: response.statusCode,
      headers: response.headers,
      body,
      json: () => JSON.parse(body.toString()),
      text: () => body.toString(),
    };
  }
  json(path, body, token) {
    return this.http(path, {
      method: 'POST',
      token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  cleanup() {
    assert.match(this.name, /^game-feedback-smoke-[a-f0-9]{10}$/);
    this.compose(['down', '--volumes', '--remove-orphans']);
  }
}

class EventStream {
  buffer = '';
  constructor(response) {
    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-type'], /text\/event-stream/);
    this.response = response;
    this.iterator = response[Symbol.asyncIterator]();
  }
  async invalidate() {
    const boundary = this.buffer.indexOf('\n\n');
    if (boundary >= 0) {
      const frame = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      if (!frame.includes('event: invalidate')) return this.invalidate();
      return JSON.parse(
        frame
          .split('\n')
          .find((line) => line.startsWith('data:'))
          .slice(5),
      );
    }
    const chunk = await this.iterator.next();
    assert.equal(chunk.done, false, 'SSE closed before invalidation');
    this.buffer += chunk.value.toString().replaceAll('\r\n', '\n');
    return this.invalidate();
  }
  close() {
    this.response.destroy();
  }
}

try {
  const original = new Stack('original');
  original.ops(['deploy', sha]);
  original.connect();
  assert.equal((await original.http('/api/health')).status, 200);
  const home = await original.http('/ko');
  assert.equal(home.status, 200);
  assert.match(home.text(), /<title>/);
  assert.match(home.text(), /noindex/);
  assert.match(
    home.text(),
    new RegExp(`<link rel="canonical" href="https://${domain.replaceAll('.', '\\.')}/ko"`),
  );
  assert.equal((await original.json('/api/auth/demo', { nickname: 'forbidden' })).status, 404);
  assert.equal((await original.http('/api/auth/test-accounts')).status, 404);
  assert.equal(original.sql('SELECT rolsuper FROM pg_roles WHERE rolname = current_user;'), 'f');
  assert.equal(original.sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;'), '1');
  assert.equal(original.sql('SELECT count(*) FROM "User";'), '0', 'Production must not seed test accounts');
  original.sql(
    `INSERT INTO "User" (id,nickname,"termsVersion","ageConfirmed") VALUES ('smoke-operator','운영확인','v1',true),('smoke-peer','대화상대','v1',true);`,
  );
  original.ops(['operator', 'grant', 'smoke-operator']);
  const token = original.ops(['operator', 'session', 'smoke-operator']).trim();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal((await original.http('/api/admin/reports', { token })).status, 200);

  const image = Buffer.from('89504e470d0a1a0a0001020304050607', 'hex');
  const boundary = `gf-${randomUUID()}`;
  const multipart = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="image.png"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    image,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const uploaded = await original.http('/api/post-media', {
    method: 'POST',
    token,
    body: multipart,
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
  });
  assert.equal(uploaded.status, 200, uploaded.text());
  const media = uploaded.json();
  assert.equal((await original.http(media.url)).status, 404);
  assert.equal(
    original.sql('SELECT count(*) FROM "PostMedia" WHERE bytes IS NULL AND "objectId" IS NOT NULL;'),
    '1',
  );
  const categories = (await original.http('/api/categories')).json();
  const post = await original.json(
    '/api/posts',
    {
      title: '배포 후 파일 보존 확인',
      body: '백업 복구 확인',
      board: 'FREE',
      categoryId: categories[0].id,
      document: { ops: [{ insert: '백업 복구 확인' }, { insert: { image: media.url } }, { insert: '\n' }] },
    },
    token,
  );
  assert.equal(post.status, 200, post.text());
  const partial = await original.http(media.url, { headers: { Range: 'bytes=8-11' } });
  assert.equal(partial.status, 206);
  assert.deepEqual(partial.body, image.subarray(8, 12));

  const conversation = await original.json('/api/conversations', { recipientId: 'smoke-peer' }, token);
  assert.equal(conversation.status, 200, conversation.text());
  const stream = new EventStream(await original.open('/api/chat/events', { token }));
  try {
    assert.deepEqual(await stream.invalidate(), { conversationId: null });
    const next = stream.invalidate();
    const sent = await original.json(
      `/api/conversations/${conversation.json().id}/messages`,
      { body: '프록시 SSE 전달 확인', clientMessageId: randomUUID() },
      token,
    );
    assert.equal(sent.status, 200, sent.text());
    assert.equal((await next).conversationId, conversation.json().id);
  } finally {
    stream.close();
  }
  original.compose(['restart', '--no-deps', 'api']);
  original.compose(['up', '-d', '--wait', 'api']);
  assert.deepEqual((await original.http(media.url)).body, image);
  const badSha = randomBytes(20).toString('hex');
  const badApi = `${imagePrefix}-api:${badSha}`;
  const badWeb = `${imagePrefix}-web:${badSha}`;
  temporaryImages.push(badApi, badWeb);
  command('docker', ['tag', `${imagePrefix}-api:${sha}`, badApi]);
  command('docker', ['build', '--platform', 'linux/amd64', '--tag', badWeb, '-'], {
    input: `FROM ${imagePrefix}-web:${sha}\nCMD ["node", "-e", "process.exit(1)"]\n`,
  });
  const rollback = spawnSync('bash', [join(original.release, 'ops.sh'), 'deploy', badSha], {
    env: { ...original.env, GF_WAIT_SECONDS: '35' },
    encoding: 'utf8',
  });
  assert.notEqual(rollback.status, 0, 'A broken Web image must fail deployment');
  assert.match(rollback.stderr, /Previous application images restored/, rollback.stderr);
  assert.equal(readFileSync(join(original.directory, '.deployed-tag'), 'utf8').trim(), sha);
  original.connect();
  assert.deepEqual((await original.http(media.url)).body, image);
  original.ops(['backup']);
  const backups = readdirSync(join(original.directory, 'backups')).filter((name) => !name.startsWith('.'));
  assert.ok(backups.length >= 2);
  const restored = new Stack('restored');
  restored.ops(['restore', join(original.directory, 'backups', backups[0]), sha, '--new-stack']);
  restored.ops(['deploy', sha]);
  restored.connect();
  assert.equal((await restored.http(`/api/posts/${post.json().id}`)).status, 200);
  assert.deepEqual((await restored.http(media.url)).body, image);
  assert.equal((await restored.http('/api/admin/reports', { token })).status, 200);
  const rejected = spawnSync(
    'bash',
    [
      join(restored.release, 'ops.sh'),
      'restore',
      join(original.directory, 'backups', backups[0]),
      sha,
      '--new-stack',
    ],
    { env: restored.env, encoding: 'utf8' },
  );
  assert.notEqual(rejected.status, 0, 'Restore must refuse an existing deployment');
  console.log(
    'Production smoke passed: migration, HTTPS, public SEO, disabled test auth, private media, Range, SSE, restart persistence, failed-deploy rollback, backup and fresh-stack restore.',
  );
} finally {
  const cleanup = stacks.toReversed().map((stack) => {
    try {
      stack.cleanup();
      return true;
    } catch {
      console.error(`Cleanup required for owned smoke stack: ${stack.name}`);
      return false;
    }
  });
  if (cleanup.every(Boolean)) rmSync(root, { recursive: true });
  temporaryImages.forEach((image) => spawnSync('docker', ['image', 'rm', image], { stdio: 'ignore' }));
}
