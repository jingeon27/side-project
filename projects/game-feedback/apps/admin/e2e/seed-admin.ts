import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  PrismaClient,
}: typeof import('../../api/src/generated/prisma') = require('../../api/src/generated/prisma');
const {
  createPrismaAdapter,
}: typeof import('../../api/src/database/prisma-adapter') = require('../../api/src/database/prisma-adapter.ts');
const {
  assertDatabaseUrl,
}: typeof import('../../api/src/database/database-url') = require('../../api/src/database/database-url.ts');
const {
  hashAdminPassword,
}: typeof import('../../api/src/admin/auth/admin-password') = require('../../api/src/admin/auth/admin-password.ts');
const db = new PrismaClient({
  adapter: createPrismaAdapter(assertDatabaseUrl(process.env.DATABASE_URL, 'test')),
});
try {
  await db.adminAccount.create({
    data: {
      username: 'e2e-admin',
      passwordHash: await hashAdminPassword('isolated-e2e-password'),
      userId: 'sample-test-admin',
    },
  });
} finally {
  await db.$disconnect();
}
