import { createRequire } from 'node:module';

import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
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
resolveMediaStorageConfig(process.env);
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
  rds_admin: z.boolean(),
});
try {
  const [role] = z.tuple([runtimeRoleSchema]).parse(
    await db.$queryRawUnsafe(`SELECT current_database() AS database,
    rolsuper OR rolcreatedb OR rolcreaterole AS elevated,
    has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create,
    has_database_privilege(current_user, current_database(), 'CREATE') AS database_create,
    EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = 'rds_superuser'
      AND pg_has_role(current_user, r.oid, 'member')) AS rds_admin
    FROM pg_roles WHERE rolname = current_user`),
  );
  if (
    !role ||
    role.database !== 'game_feedback' ||
    role.elevated ||
    role.schema_create ||
    role.database_create ||
    role.rds_admin
  )
    throw new Error('The runtime role must have DML-only access to its dedicated database.');
  await storage.send(new HeadBucketCommand({ Bucket: process.env.GF_S3_BUCKET }), {
    abortSignal: AbortSignal.timeout(10000),
  });
  console.log('Verified runtime RDS role and S3 bucket access.');
} catch {
  console.error('RDS role/TLS or private S3 access verification failed.');
  process.exitCode = 1;
} finally {
  await db.$disconnect();
  storage.destroy();
}
