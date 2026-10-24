import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createPrismaAdapter } = require('../dist/database/prisma-adapter.js');
const { assertProductionConfig } = require('../dist/config/env.js');
const { sharedDatabaseUrl } = require('../dist/config/shared-instance.js');
const { PrismaClient } = require('../generated/prisma/index.js');
if (process.env.NODE_ENV !== 'production' || process.env.DEPLOYMENT_TARGET !== 'shared-instance')
  throw new Error('Shared-instance production configuration is required.');
assertProductionConfig();
const [action] = process.argv.slice(2);
if (action === 'validate') process.exit(0);
if (action !== 'migrate') throw new Error('Use validate or migrate.');
const url = sharedDatabaseUrl(process.env, true);
const migration = spawnSync(
  process.execPath,
  [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
  {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  },
);
if (migration.status !== 0) process.exit(migration.status ?? 1);
const db = new PrismaClient({ adapter: createPrismaAdapter(url) });
try {
  await db.$transaction([
    db.$executeRawUnsafe(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO photo_contest',
    ),
    db.$executeRawUnsafe('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO photo_contest'),
    db.$executeRawUnsafe('REVOKE ALL ON TABLE "_prisma_migrations" FROM photo_contest'),
  ]);
} finally {
  await db.$disconnect();
}
