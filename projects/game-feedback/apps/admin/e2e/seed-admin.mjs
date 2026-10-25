import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('../../api/src/generated/prisma');
const { createPrismaAdapter } = require('../../api/src/database/prisma-adapter.ts');
const { assertDatabaseUrl } = require('../../api/src/database/database-url.ts');
const { hashAdminPassword } = require('../../api/src/admin/auth/admin-password.ts');
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
