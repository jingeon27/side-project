import { createRequire } from 'node:module';

export default async function teardown() {
  const schema = process.env.GF_MOBILE_E2E_SCHEMA;
  if (!schema || !/^gf_test_[a-z0-9_]+$/.test(schema))
    throw new Error('Refusing to clean an unowned test schema.');
  const requireApi = createRequire(new URL('../../api/package.json', import.meta.url));
  const { PrismaClient } = requireApi('./src/generated/prisma');
  const target = new URL(process.env.GF_MOBILE_E2E_DATABASE_URL ?? '');
  if (
    !['postgresql:', 'postgres:'].includes(target.protocol) ||
    !['127.0.0.1', 'localhost'].includes(target.hostname) ||
    target.port !== '55444' ||
    target.pathname !== '/game_feedback_test' ||
    decodeURIComponent(target.username) !== 'game_feedback' ||
    target.searchParams.get('schema') !== schema
  )
    throw new Error('Refusing to clean an unexpected database.');
  const db = new PrismaClient({ datasources: { db: { url: target.toString() } } });
  try {
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await db.$disconnect();
  }
}
