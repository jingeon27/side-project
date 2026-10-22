import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('../dist/generated/prisma/index.js');
const { assertDatabaseUrl } = require('../dist/database/database-url.js');
const { grantOperatorRole, issueOperatorSession } = require('../dist/admin/operator-session.js');

const [command, userId] = process.argv.slice(2);
const usage = 'Usage: operator.mjs users | grant <user-id> | session <user-id>';
if (process.env.NODE_ENV !== 'production') throw new Error('Operator CLI requires NODE_ENV=production.');
const commands = {
  async users(db) {
    const users = await db.user.findMany({
      where: { demoKey: null },
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: { id: true, nickname: true, role: true },
    });
    process.stdout.write(`${JSON.stringify(users, null, 2)}\n`);
  },
  async grant(db) {
    if (!userId) throw new Error(usage);
    process.stdout.write(`${JSON.stringify(await grantOperatorRole(db, userId))}\n`);
  },
  async session(db) {
    if (!userId) throw new Error(usage);
    // This explicit command prints a credential for the operator to capture into a local environment file.
    // It must never run in CI, an HTTP request, or application logs.
    const { accessToken } = await issueOperatorSession(db, userId);
    process.stdout.write(accessToken);
  },
};
if (!Object.hasOwn(commands, command)) throw new Error(usage);
const db = new PrismaClient({ datasources: { db: { url: assertDatabaseUrl(process.env.DATABASE_URL) } } });
try {
  await commands[command](db);
} finally {
  await db.$disconnect();
}
