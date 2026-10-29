import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises';
import { createConnection, createServer, type Server, type Socket } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type EmbeddedPostgres from 'embedded-postgres';
import { match } from 'ts-pattern';
import { z } from 'zod';

import { guardDatabaseUrl } from './database-guard.ts';
import {
  controlMessageSchema,
  controlResponseSchema,
  controlStateSchema,
  databaseLockSchema,
  databaseOwnerSchema,
  databaseRoleSchema,
  rolePrivilegesSchema,
} from './database-state.ts';
import { assertNode, environment, projectDir, testDatabaseUrl, yarn } from './env.ts';

interface IDatabaseLifecycle {
  pg?: EmbeddedPostgres;
  server?: Server;
  stopping: boolean;
}

interface IControlConnectionOptions {
  token: string;
  target: Pick<ReturnType<typeof guardDatabaseUrl>, 'database' | 'port'>;
  onShutdown: () => Promise<void>;
}

const command = process.argv[2] ?? 'status';
const isTest = process.argv.includes('--test');
const env = environment();
const configuredTest = URL.parse(env.DATABASE_URL ?? '');
const databaseUrl = isTest
  ? configuredTest?.pathname === '/game_feedback_test'
    ? env.DATABASE_URL
    : testDatabaseUrl
  : env.DATABASE_URL;
const target = guardDatabaseUrl(databaseUrl, { test: isTest, allowTestSchema: command === 'sync' });
const label = isTest ? 'test' : 'dev';
const dataRoot = path.join(projectDir, '.data');
const dataDir = path.join(dataRoot, `postgres-${label}`);
const statePath = path.join(dataRoot, `postgres-${label}.control.json`);
const lockPath = path.join(dataRoot, `postgres-${label}.lock`);
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const readJson = async <TSchema extends z.ZodType>(file: string, schema: TSchema) => {
  try {
    return schema.parse(JSON.parse(await readFile(file, 'utf8')));
  } catch {
    return null;
  }
};

async function control(action: string) {
  const state = await readJson(statePath, controlStateSchema);
  if (!state) return null;
  return new Promise<z.output<typeof controlResponseSchema> | null>((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port: state.port });
    const chunks: string[] = [];
    socket.setTimeout(1000);
    const done = (value: z.output<typeof controlResponseSchema> | null) => {
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => socket.write(JSON.stringify({ token: state.token, action }) + '\n'));
    socket.on('data', (chunk) => {
      chunks.push(chunk.toString());
      const result = chunks.join('');
      if (result.includes('\n')) {
        try {
          const parsed = controlResponseSchema.safeParse(JSON.parse(result));
          done(parsed.success ? parsed.data : null);
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

async function portInUse(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const done = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(750);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(true));
  });
}

async function waitForReady(state: { failure?: Error }, logPath: string, attempt = 0): Promise<void> {
  if (attempt === 180)
    throw new Error(`Database did not become ready. See ${path.relative(projectDir, logPath)}.`);
  if ((await control('status'))?.ready) {
    console.log(`Game Feedback ${label} database started on ${target.port}.`);
    return;
  }
  if (state.failure) throw new Error(`${state.failure.message} See ${path.relative(projectDir, logPath)}.`);
  await delay(250);
  return waitForReady(state, logPath, attempt + 1);
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
  const state: { failure?: Error } = {};
  child.once('error', (error) => {
    state.failure = error;
  });
  child.once('exit', (code) => {
    state.failure = new Error(`Database owner exited with status ${code}.`);
  });
  await waitForReady(state, logPath);
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(error instanceof Error && 'code' in error && error.code === 'ESRCH');
  }
}

async function shutdown(lifecycle: IDatabaseLifecycle, statePath: string, lockPath: string) {
  if (lifecycle.stopping) return;
  lifecycle.stopping = true;
  lifecycle.server?.close();
  try {
    await lifecycle.pg?.stop();
  } finally {
    await Promise.all([unlink(statePath).catch(() => {}), unlink(lockPath).catch(() => {})]);
  }
  process.exit(0);
}

async function isDatabaseInitialized(dataDir: string) {
  try {
    await access(path.join(dataDir, 'PG_VERSION'));
    return true;
  } catch {
    return false;
  }
}

async function createOwner(dataDir: string, ownerPath: string, project: string) {
  if (await isDatabaseInitialized(dataDir))
    throw new Error('Database directory has no Game Feedback owner marker. Refusing to manage it.');
  const owner = {
    project,
    user: 'game_feedback_local_admin',
    password: randomBytes(32).toString('hex'),
  };
  await writeFile(ownerPath, JSON.stringify(owner), { mode: 0o600, flag: 'wx' });
  return owner;
}

async function configureServiceDatabase(pg: EmbeddedPostgres, target: ReturnType<typeof guardDatabaseUrl>) {
  const client = pg.getPgClient('postgres', '127.0.0.1');
  await client.connect();
  try {
    const role = await client.query<Record<string, unknown>>(
      'SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = $1',
      [target.user],
    );
    const privileges = z.array(rolePrivilegesSchema).parse(role.rows);
    if (privileges.some((row) => row.rolsuper || row.rolcreatedb || row.rolcreaterole))
      throw new Error('Service role unexpectedly has elevated privileges.');
    const roleStatement = role.rowCount
      ? `ALTER ROLE ${client.escapeIdentifier(target.user)} PASSWORD`
      : `CREATE ROLE ${client.escapeIdentifier(target.user)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD`;
    await client.query(`${roleStatement} ${client.escapeLiteral(target.password)}`);
    const database = await client.query<Record<string, unknown>>(
      'SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = $1',
      [target.database],
    );
    const owners = z.array(databaseRoleSchema).parse(database.rows);
    if (database.rowCount && owners[0]?.owner !== target.user)
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
}

function parseControlMessage(request: string) {
  try {
    const parsed = controlMessageSchema.safeParse(JSON.parse(request));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function handleControlRequest(
  request: string,
  socket: Socket,
  { token, target, onShutdown }: IControlConnectionOptions,
) {
  if (request.length > 2048) return socket.destroy();
  if (!request.includes('\n')) return;
  const message = parseControlMessage(request);
  if (!message || message.token !== token) return socket.destroy();
  socket.end(JSON.stringify({ ready: true, database: target.database, port: target.port }) + '\n');
  if (message.action === 'stop') setTimeout(onShutdown, 30);
}

function handleControlConnection(socket: Socket, options: IControlConnectionOptions) {
  const chunks: string[] = [];
  socket.setTimeout(1500, () => socket.destroy());
  socket.on('data', (chunk) => {
    chunks.push(chunk.toString());
    handleControlRequest(chunks.join(''), socket, options);
  });
}

async function serve() {
  await mkdir(dataRoot, { recursive: true });
  const stale = await readJson(lockPath, databaseLockSchema);
  if (stale?.pid && !isProcessAlive(stale.pid)) await unlink(lockPath);
  const lock = await open(lockPath, 'wx', 0o600);
  await lock.writeFile(JSON.stringify({ pid: process.pid }));
  await lock.close();
  const lifecycle: IDatabaseLifecycle = { stopping: false };
  const handleShutdown = () => shutdown(lifecycle, statePath, lockPath);
  process.once('SIGTERM', handleShutdown);
  process.once('SIGINT', handleShutdown);
  try {
    const ownerPath = path.join(dataRoot, `postgres-${label}.owner.json`);
    const existingOwner = await readJson(ownerPath, databaseOwnerSchema);
    const owner = existingOwner ?? (await createOwner(dataDir, ownerPath, projectDir));
    if (owner.project !== projectDir || owner.user !== 'game_feedback_local_admin')
      throw new Error('Database owner marker belongs to another project.');
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    const pg = (lifecycle.pg = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: owner.user,
      password: owner.password,
      port: target.port,
      authMethod: 'scram-sha-256',
      persistent: true,
      postgresFlags: ['-h', '127.0.0.1', '-c', 'unix_socket_directories='],
    }));
    if (!(await isDatabaseInitialized(dataDir))) await pg.initialise();
    await pg.start();
    await configureServiceDatabase(pg, target);
    const token = randomBytes(32).toString('hex');
    const server = (lifecycle.server = createServer((socket) =>
      handleControlConnection(socket, { token, target, onShutdown: handleShutdown }),
    ));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Database control server has no TCP address.');
    await writeFile(statePath, JSON.stringify({ port: address.port, token }), { mode: 0o600 });
    console.log(`Owned Game Feedback ${label} PostgreSQL ready on ${target.port}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    await lifecycle.pg?.stop();
    await unlink(lockPath).catch(() => {});
    process.exitCode = 1;
  }
}

async function waitForStop(remaining = 80): Promise<void> {
  if (!remaining || !(await control('status'))) return;
  await delay(100);
  return waitForStop(remaining - 1);
}

async function stop() {
  if (!(await control('stop'))) {
    console.log(`No owned Game Feedback ${label} database is running.`);
    return;
  }
  await waitForStop();
  if (await control('status')) throw new Error('Database shutdown is still pending.');
  console.log(`Game Feedback ${label} database stopped; data retained.`);
}

async function status() {
  const state = await control('status');
  console.log(
    state?.ready
      ? `Game Feedback ${label} database is running on ${target.port}.`
      : `Game Feedback ${label} database is stopped.`,
  );
}

async function sync() {
  await yarn(['workspace', '@game-feedback/api', 'prisma:sync'], { ...env, DATABASE_URL: databaseUrl });
}

try {
  assertNode();
  await match(command)
    .with('start', start)
    .with('_serve', serve)
    .with('stop', stop)
    .with('status', status)
    .with('sync', sync)
    .otherwise(() => {
      throw new Error('Usage: db.ts start|stop|status|sync [--test]');
    });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
