import { createRequire } from 'node:module';

import { guardDatabaseUrl } from '../../../scripts/database-guard.mjs';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('../dist/generated/prisma/index.js');
const { createPrismaAdapter } = require('../dist/database/prisma-adapter.js');
const { assertDatabaseUrl } = require('../dist/database/database-url.js');
const { resolveMediaStorageConfig } = require('../dist/media-storage/media-storage.config.js');
const { migrateLegacyMedia } = require('../dist/media-storage/migrate-legacy-media.js');
const { validateProductionEnvironment } = require('../dist/config/production.config.js');
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--apply' && !arg.startsWith('--source-directory=')))
  throw new Error('Usage: migrate-media.mjs [--apply] [--source-directory=/absolute/path]');
if (process.env.ENVIRONMENT === 'production') validateProductionEnvironment(process.env);
if (process.env.ENVIRONMENT !== 'production') {
  const { environment } = await import('../../../scripts/env.mjs');
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
