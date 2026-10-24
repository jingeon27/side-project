import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createPrismaAdapter } = require('../dist/database/prisma-adapter.js');
const { validateProductionEnvironment } = require('../dist/config/production.config.js');
const { assertDatabaseUrl } = require('../dist/database/database-url.js');
const { sharedDatabaseUrl } = require('../dist/config/shared-instance.config.js');
const { PrismaClient } = require('../dist/generated/prisma/index.js');
const { seed } = require('../dist/seed.js');
if (process.env.NODE_ENV !== 'production')
  throw new Error('Production migration requires NODE_ENV=production.');
validateProductionEnvironment(process.env);
const shared = process.env.DEPLOYMENT_TARGET === 'shared-instance';
const databaseUrl = shared
  ? sharedDatabaseUrl(process.env, true)
  : assertDatabaseUrl(process.env.DATABASE_URL);
const result = spawnSync(
  process.execPath,
  [require.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
  { stdio: 'inherit', env: { ...process.env, DATABASE_URL: databaseUrl } },
);
if (result.status !== 0) process.exit(result.status ?? 1);
const db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
try {
  await seed(db, false);
  if (shared)
    await db.$transaction([
      db.$executeRawUnsafe(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO game_feedback',
      ),
      db.$executeRawUnsafe('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO game_feedback'),
      db.$executeRawUnsafe('REVOKE ALL ON TABLE "_prisma_migrations" FROM game_feedback'),
    ]);
  console.log('Production migration and category seed completed.');
} finally {
  await db.$disconnect();
}
