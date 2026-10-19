import { mkdir, readFile, writeFile, unlink, open, access } from 'node:fs/promises';
import { createServer, createConnection } from 'node:net';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertNode, environment, projectDir, yarn } from './env.mjs';
import { guardDatabaseUrl } from './database-guard.mjs';

const command = process.argv[2] ?? 'status';
const isTest = process.argv.includes('--test');
const env = environment();
const databaseUrl = isTest ? env.TEST_DATABASE_URL : env.DATABASE_URL;
const target = guardDatabaseUrl(databaseUrl, { test: isTest, allowTestSchema: command === 'sync' });
const label = isTest ? 'test' : 'dev';
const dataRoot = path.join(projectDir, '.data');
const dataDir = path.join(dataRoot, `postgres-${label}`);
const statePath = path.join(dataRoot, `postgres-${label}.control.json`);
const lockPath = path.join(dataRoot, `postgres-${label}.lock`);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readJson = async (file) => {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
};

async function control(action) {
  const state = await readJson(statePath);
  if (
    !state ||
    !Number.isInteger(state.port) ||
    state.port < 1 ||
    state.port > 65535 ||
    !/^[a-f0-9]{64}$/.test(state.token)
  )
    return null;
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port: state.port });
    let result = '';
    socket.setTimeout(1000);
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => socket.write(JSON.stringify({ token: state.token, action }) + '\n'));
    socket.on('data', (chunk) => {
      result += chunk;
      if (result.includes('\n')) {
        try {
          done(JSON.parse(result));
        } catch {
          done(null);
        }
      }
    });
    socket.once('timeout', () => done(null));
    socket.once('error', () => done(null));
    socket.once('end', () => done(null));
  });
}

async function portInUse(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(750);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(true));
  });
}

async function start() {
  const existing = await control('status');
  if (existing?.ready) {
    console.log(`Game Feedback ${label} database is running on ${target.port}.`);
    return;
  }
  if (await portInUse(target.port))
    throw new Error(`Port ${target.port} is in use by an unmanaged process. No process was stopped.`);
  await mkdir(dataRoot, { recursive: true });
  const logPath = path.join(dataRoot, `postgres-${label}.log`);
  const log = await open(logPath, 'a', 0o600);
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), '_serve', ...(isTest ? ['--test'] : [])],
    {
      cwd: projectDir,
      env,
      detached: true,
      stdio: ['ignore', log.fd, log.fd],
    },
  );
  await log.close();
  child.unref();
  let failure;
  child.once('error', (error) => {
    failure = error;
  });
  child.once('exit', (code) => {
    failure = new Error(`Database owner exited with status ${code}.`);
  });
  for (let attempt = 0; attempt < 180; attempt++) {
    if ((await control('status'))?.ready) {
      console.log(`Game Feedback ${label} database started on ${target.port}.`);
      return;
    }
    if (failure) throw new Error(`${failure.message} See ${path.relative(projectDir, logPath)}.`);
    await delay(250);
  }
  throw new Error(`Database did not become ready. See ${path.relative(projectDir, logPath)}.`);
}

async function serve() {
  await mkdir(dataRoot, { recursive: true });
  const stale = await readJson(lockPath);
  if (stale?.pid) {
    let alive = true;
    try {
      process.kill(stale.pid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') alive = false;
    }
    if (!alive) await unlink(lockPath);
  }
  const lock = await open(lockPath, 'wx', 0o600);
  await lock.writeFile(JSON.stringify({ pid: process.pid }));
  await lock.close();
  let pg;
  let server;
  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    server?.close();
    try {
      await pg?.stop();
    } finally {
      await Promise.all([unlink(statePath).catch(() => {}), unlink(lockPath).catch(() => {})]);
    }
    process.exit(0);
  }
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  try {
    const ownerPath = path.join(dataRoot, `postgres-${label}.owner.json`);
    let owner = await readJson(ownerPath);
    if (!owner) {
      let initialized = false;
      try {
        await access(path.join(dataDir, 'PG_VERSION'));
        initialized = true;
      } catch {}
      if (initialized)
        throw new Error('Database directory has no Game Feedback owner marker. Refusing to manage it.');
      owner = {
        project: projectDir,
        user: 'game_feedback_local_admin',
        password: randomBytes(32).toString('hex'),
      };
      await writeFile(ownerPath, JSON.stringify(owner), { mode: 0o600, flag: 'wx' });
    }
    if (owner.project !== projectDir || owner.user !== 'game_feedback_local_admin')
      throw new Error('Database owner marker belongs to another project.');
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    pg = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: owner.user,
      password: owner.password,
      port: target.port,
      authMethod: 'scram-sha-256',
      persistent: true,
      postgresFlags: ['-h', '127.0.0.1', '-c', 'unix_socket_directories='],
    });
    try {
      await access(path.join(dataDir, 'PG_VERSION'));
    } catch {
      await pg.initialise();
    }
    await pg.start();
    const client = pg.getPgClient('postgres', '127.0.0.1');
    await client.connect();
    try {
      const role = await client.query(
        'SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = $1',
        [target.user],
      );
      if (role.rows.some((row) => row.rolsuper || row.rolcreatedb || row.rolcreaterole))
        throw new Error('Service role unexpectedly has elevated privileges.');
      if (!role.rowCount)
        await client.query(
          `CREATE ROLE ${client.escapeIdentifier(target.user)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${client.escapeLiteral(target.password)}`,
        );
      else
        await client.query(
          `ALTER ROLE ${client.escapeIdentifier(target.user)} PASSWORD ${client.escapeLiteral(target.password)}`,
        );
      const database = await client.query(
        'SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = $1',
        [target.database],
      );
      if (database.rowCount && database.rows[0].owner !== target.user)
        throw new Error('Service database has an unexpected owner.');
      if (!database.rowCount)
        await client.query(
          `CREATE DATABASE ${client.escapeIdentifier(target.database)} OWNER ${client.escapeIdentifier(target.user)}`,
        );
      await client.query(`REVOKE CONNECT ON DATABASE postgres FROM PUBLIC`);
      await client.query(`REVOKE CONNECT ON DATABASE template1 FROM PUBLIC`);
    } finally {
      await client.end();
    }
    const token = randomBytes(32).toString('hex');
    server = createServer((socket) => {
      let request = '';
      socket.setTimeout(1500, () => socket.destroy());
      socket.on('data', (chunk) => {
        request += chunk;
        if (request.length > 2048) return socket.destroy();
        if (!request.includes('\n')) return;
        let message;
        try {
          message = JSON.parse(request);
        } catch {
          return socket.destroy();
        }
        if (message.token !== token) return socket.destroy();
        socket.end(JSON.stringify({ ready: true, database: target.database, port: target.port }) + '\n');
        if (message.action === 'stop') setTimeout(shutdown, 30);
      });
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    await writeFile(statePath, JSON.stringify({ port: server.address().port, token }), { mode: 0o600 });
    console.log(`Owned Game Feedback ${label} PostgreSQL ready on ${target.port}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    await pg?.stop();
    await unlink(lockPath).catch(() => {});
    process.exitCode = 1;
  }
}

try {
  assertNode();
  if (command === 'start') await start();
  else if (command === '_serve') await serve();
  else if (command === 'stop') {
    if (!(await control('stop'))) console.log(`No owned Game Feedback ${label} database is running.`);
    else {
      for (let n = 0; n < 80 && (await control('status')); n++) await delay(100);
      if (await control('status')) throw new Error('Database shutdown is still pending.');
      console.log(`Game Feedback ${label} database stopped; data retained.`);
    }
  } else if (command === 'status') {
    const state = await control('status');
    console.log(
      state?.ready
        ? `Game Feedback ${label} database is running on ${target.port}.`
        : `Game Feedback ${label} database is stopped.`,
    );
  } else if (command === 'sync') {
    await yarn(['workspace', '@game-feedback/api', 'prisma:sync'], { ...env, DATABASE_URL: databaseUrl });
  } else throw new Error('Usage: db.mjs start|stop|status|sync [--test]');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
