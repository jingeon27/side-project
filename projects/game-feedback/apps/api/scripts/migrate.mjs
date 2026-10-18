import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { validateProductionEnvironment } = require('../dist/config/production.config.js');
const { assertDatabaseUrl } = require('../dist/database/database-url.js');
const { PrismaClient } = require('../dist/generated/prisma/index.js');
const { seed } = require('../dist/seed.js');
if (process.env.NODE_ENV !== 'production')
  throw new Error('Production migration requires NODE_ENV=production.');
validateProductionEnvironment(process.env);
const databaseUrl = assertDatabaseUrl(process.env.DATABASE_URL);
const result = spawnSync(
  process.execPath,
  [require.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
  { stdio: 'inherit' },
);
if (result.status !== 0) process.exit(result.status ?? 1);
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
try {
  await seed(db, false);
  console.log('Production migration and category seed completed.');
} finally {
  await db.$disconnect();
}
