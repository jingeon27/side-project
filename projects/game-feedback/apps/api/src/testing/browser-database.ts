import { randomUUID } from 'node:crypto';

import { assertDatabaseUrl } from '../database/database-url';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { PrismaClient } from '../generated/prisma';

const TEST_DATABASE = 'postgresql://game_feedback:game_feedback_local@127.0.0.1:55444/game_feedback_test';

export function prepareBrowserDatabase(prefix: 'web' | 'mobile' | 'admin') {
  const inherited = URL.parse(process.env.DATABASE_URL ?? '');
  const target = inherited?.pathname === '/game_feedback_test' ? inherited : new URL(TEST_DATABASE);
  const previous = target.searchParams.get('schema');
  if (previous && previous !== 'public' && !new RegExp(`^gf_test_${prefix}_[a-f0-9]{32}$`).test(previous))
    throw new Error('Browser tests require an owned schema.');
  const schema =
    previous && previous !== 'public' ? previous : `gf_test_${prefix}_${randomUUID().replaceAll('-', '')}`;
  target.searchParams.set('schema', schema);
  const databaseUrl = assertDatabaseUrl(target.toString(), 'test');
  process.env.DATABASE_URL = databaseUrl;
  return { schema, databaseUrl: new URL(databaseUrl) };
}

export async function dropBrowserDatabase() {
  const databaseUrl = assertDatabaseUrl(process.env.DATABASE_URL, 'test');
  const schema = new URL(databaseUrl).searchParams.get('schema');
  if (!schema || !/^gf_test_(web|mobile|admin)_[a-f0-9]{32}$/.test(schema))
    throw new Error('Refusing to clean an unowned schema.');
  const db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
  try {
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await db.$disconnect();
  }
}
