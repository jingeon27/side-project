import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateProductionEnvironment, resolveListenConfig } = require('../dist/config/production.config.js');
const { resolveMediaStorageConfig } = require('../dist/media-storage/media-storage.config.js');
const { assertDatabaseUrl } = require('../dist/database/database-url.js');
try {
  if (process.env.NODE_ENV !== 'production')
    throw new Error('Production validation requires NODE_ENV=production.');
  validateProductionEnvironment(process.env);
  resolveListenConfig(process.env);
  resolveMediaStorageConfig(process.env);
  assertDatabaseUrl(process.env.DATABASE_URL);
  console.log('Production configuration is valid.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Production configuration is invalid.');
  process.exitCode = 1;
}
