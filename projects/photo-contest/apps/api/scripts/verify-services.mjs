import { createRequire } from 'node:module';

import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

const require = createRequire(import.meta.url);
const { createPrismaAdapter } = require('../dist/database/prisma-adapter.js');
const { PrismaClient } = require('../generated/prisma/index.js');
if (process.env.NODE_ENV !== 'production')
  throw new Error('Shared-instance production configuration is required.');
const { assertProductionConfig } = require('../dist/config/env.js');
assertProductionConfig();
const { sharedDatabaseUrl } = require('../dist/config/shared-instance.js');
sharedDatabaseUrl(process.env);
const db = new PrismaClient({ adapter: createPrismaAdapter(process.env.DATABASE_URL) });
const storage = new S3Client({
  region: 'ap-northeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  maxAttempts: 1,
});
try {
  const [role] = await db.$queryRawUnsafe(`SELECT current_database() AS database,
    rolsuper OR rolcreatedb OR rolcreaterole AS elevated,
    has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create,
    has_database_privilege(current_user, current_database(), 'CREATE') AS database_create,
    EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = 'rds_superuser'
      AND pg_has_role(current_user, r.oid, 'member')) AS rds_admin
    FROM pg_roles WHERE rolname = current_user`);
  if (
    !role ||
    role.database !== 'photo_contest' ||
    role.elevated ||
    role.schema_create ||
    role.database_create ||
    role.rds_admin
  )
    throw new Error('The runtime role must have DML-only access to its dedicated database.');
  await storage.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET }), {
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
