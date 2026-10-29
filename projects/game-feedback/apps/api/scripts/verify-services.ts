import { createRequire } from 'node:module';

import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const {
  createPrismaAdapter,
}: typeof import('../src/database/prisma-adapter') = require('../dist/database/prisma-adapter.js');
const {
  PrismaClient,
}: typeof import('../src/generated/prisma/index') = require('../dist/generated/prisma/index.js');
if (process.env.ENVIRONMENT !== 'production')
  throw new Error('Shared-instance production configuration is required.');
const {
  validateProductionEnvironment,
}: typeof import('../src/config/production.config') = require('../dist/config/production.config.js');
const {
  resolveMediaStorageConfig,
}: typeof import('../src/media-storage/media-storage.config') = require('../dist/media-storage/media-storage.config.js');
validateProductionEnvironment(process.env);
const mediaStorage = resolveMediaStorageConfig(process.env);
const {
  sharedDatabaseUrl,
}: typeof import('../src/config/shared-instance.config') = require('../dist/config/shared-instance.config.js');
const databaseUrl = sharedDatabaseUrl(process.env);
const db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
const storage = new S3Client({
  region: 'ap-northeast-2',
  credentials: {
    accessKeyId: process.env.GF_S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.GF_S3_SECRET_ACCESS_KEY ?? '',
  },
  maxAttempts: 1,
});
const runtimeRoleSchema = z.object({
  database: z.string(),
  elevated: z.boolean(),
  schema_create: z.boolean(),
  database_create: z.boolean(),
});
try {
  const [role] = z.tuple([runtimeRoleSchema]).parse(
    await db.$queryRawUnsafe(`SELECT current_database() AS database,
    rolsuper OR rolcreatedb OR rolcreaterole AS elevated,
    has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create,
    has_database_privilege(current_user, current_database(), 'CREATE') AS database_create
    FROM pg_roles WHERE rolname = current_user`),
  );
  if (
    !role ||
    role.database !== 'game_feedback' ||
    role.elevated ||
    role.schema_create ||
    role.database_create
  )
    throw new Error('The runtime role must have DML-only access to its dedicated database.');
  // The shared bucket only grants ListBucket on the service folder, so HeadBucket would be denied.
  await storage.send(
    new ListObjectsV2Command({
      Bucket: mediaStorage.bucket,
      Prefix: mediaStorage.keyPrefix ? `${mediaStorage.keyPrefix}/` : undefined,
      MaxKeys: 1,
    }),
    { abortSignal: AbortSignal.timeout(10000) },
  );
  console.log('Verified runtime database role and S3 folder access.');
} catch {
  console.error('Database role or private S3 access verification failed.');
  process.exitCode = 1;
} finally {
  await db.$disconnect();
  storage.destroy();
}
