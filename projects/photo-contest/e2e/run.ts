import { PrismaClient } from '@photo-contest/api/database-client';
import { randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL을 지정한 개발 DB가 필요합니다.');
  const db = new PrismaClient();
  const schema = `contest_e2e_${randomUUID().replaceAll('-', '')}`;
  const directory = resolve('.data', schema);
  await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const connection = new URL(process.env.DATABASE_URL);
  connection.searchParams.set('schema', schema);
  const env = {
    ...process.env,
    DATABASE_URL: connection.toString(),
    STORAGE_DIR: directory,
    STORAGE_BACKEND: 'local',
  };
  try {
    await mkdir(directory, { recursive: true });
    execFileSync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'migrate',
        'deploy',
        '--schema',
        '../apps/api/prisma/schema.prisma',
      ],
      { env, stdio: 'inherit' },
    );
    const child = spawn(
      process.execPath,
      [require.resolve('@playwright/test/cli'), 'test', ...process.argv.slice(2)],
      { env, stdio: 'inherit' },
    );
    const code = await new Promise<number>((resolve) => child.on('exit', (code) => resolve(code ?? 1)));
    process.exitCode = code;
  } finally {
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
