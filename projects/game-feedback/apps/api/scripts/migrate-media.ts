import { createRequire } from 'node:module';

import { guardDatabaseUrl } from '../../../scripts/database-guard.ts';

const require = createRequire(import.meta.url);
const {
  PrismaClient,
}: typeof import('../src/generated/prisma/index') = require('../dist/generated/prisma/index.js');
const {
  createPrismaAdapter,
}: typeof import('../src/database/prisma-adapter') = require('../dist/database/prisma-adapter.js');
const {
  assertDatabaseUrl,
}: typeof import('../src/database/database-url') = require('../dist/database/database-url.js');
const {
  resolveMediaStorageConfig,
}: typeof import('../src/media-storage/media-storage.config') = require('../dist/media-storage/media-storage.config.js');
const {
  migrateLegacyMedia,
}: typeof import('../src/media-storage/migrate-legacy-media') = require('../dist/media-storage/migrate-legacy-media.js');
const {
  validateProductionEnvironment,
}: typeof import('../src/config/production.config') = require('../dist/config/production.config.js');
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--apply' && !arg.startsWith('--source-directory=')))
  throw new Error('Usage: migrate-media.ts [--apply] [--source-directory=/absolute/path]');
if (process.env.ENVIRONMENT === 'production') validateProductionEnvironment(process.env);
if (process.env.ENVIRONMENT !== 'production') {
  const { environment } = await import('../../../scripts/env.ts');
  Object.assign(process.env, environment());
  guardDatabaseUrl(process.env.DATABASE_URL);
}
const db = new PrismaClient({ adapter: createPrismaAdapter(assertDatabaseUrl(process.env.DATABASE_URL)) });
try {
  console.log(
    JSON.stringify(
      await migrateLegacyMedia(db, resolveMediaStorageConfig(process.env), {
        apply: args.includes('--apply'),
        directory: args
          .find((arg) => arg.startsWith('--source-directory='))
          ?.slice('--source-directory='.length),
      }),
    ),
  );
} finally {
  await db.$disconnect();
}
