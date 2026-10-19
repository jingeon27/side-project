import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../dist/generated/prisma/index.js');
const { assertDatabaseUrl } = require('../dist/database/database-url.js');
const { grantOperatorRole, issueOperatorSession } = require('../dist/admin/operator-session.js');

const [command, userId] = process.argv.slice(2);
if (process.env.NODE_ENV !== 'production') throw new Error('Operator CLI requires NODE_ENV=production.');
const db = new PrismaClient({ datasources: { db: { url: assertDatabaseUrl(process.env.DATABASE_URL) } } });
try {
  if (command === 'users') {
    const users = await db.user.findMany({
      where: { demoKey: null },
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: { id: true, nickname: true, role: true },
    });
    process.stdout.write(`${JSON.stringify(users, null, 2)}\n`);
  } else if (command === 'grant' && userId) {
    process.stdout.write(`${JSON.stringify(await grantOperatorRole(db, userId))}\n`);
  } else if (command === 'session' && userId) {
    // This explicit command prints a credential for the operator to capture into a local environment file.
    // It must never run in CI, an HTTP request, or application logs.
    const { accessToken } = await issueOperatorSession(db, userId);
    process.stdout.write(accessToken);
  } else {
    throw new Error('Usage: operator.mjs users | grant <user-id> | session <user-id>');
  }
} finally {
  await db.$disconnect();
}
