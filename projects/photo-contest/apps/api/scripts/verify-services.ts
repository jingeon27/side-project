import { createRequire } from 'node:module';

import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const {
  createPrismaAdapter,
}: typeof import('../src/database/prisma-adapter') = require('../dist/database/prisma-adapter.js');
const { PrismaClient }: typeof import('../generated/prisma/index') = require('../generated/prisma/index.js');
if (process.env.NODE_ENV !== 'production')
  throw new Error('Shared-instance production configuration is required.');
const {
  assertProductionConfig,
  s3KeyPrefix,
}: typeof import('../src/config/env') = require('../dist/config/env.js');
assertProductionConfig();
const {
  sharedDatabaseUrl,
}: typeof import('../src/config/shared-instance') = require('../dist/config/shared-instance.js');
const databaseUrl = sharedDatabaseUrl(process.env);
const db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
const storage = new S3Client({
  region: 'ap-northeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
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
    role.database !== 'photo_contest' ||
    role.elevated ||
    role.schema_create ||
    role.database_create
  )
    throw new Error('The runtime role must have DML-only access to its dedicated database.');
  // 공용 버킷은 서비스 폴더의 목록 권한만 주므로 버킷 전체를 확인하는 HeadBucket은 거부된다.
  await storage.send(
    new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET,
      Prefix: s3KeyPrefix() || undefined,
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
