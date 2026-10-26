import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const prefix = process.env.ENVIRONMENT === 'production' ? '../dist' : '../src';
const extension = process.env.ENVIRONMENT === 'production' ? 'js' : 'ts';
const { createPrismaAdapter }: typeof import('../src/database/prisma-adapter') = require(
  `${prefix}/database/prisma-adapter.${extension}`,
);
const { PrismaClient }: typeof import('../src/generated/prisma/index') = require(
  `${prefix}/generated/prisma/index.js`,
);
const { assertDatabaseUrl }: typeof import('../src/database/database-url') = require(
  `${prefix}/database/database-url.${extension}`,
);
const { createAdminAccount, resetAdminPassword }: typeof import('../src/admin/auth/admin-account') = require(
  `${prefix}/admin/auth/admin-account.${extension}`,
);

const [command, username] = process.argv.slice(2);
if (!command || !['create', 'reset-password'].includes(command) || !username)
  throw new Error('Usage: operator.ts create <admin-id> | reset-password <admin-id> (password on stdin)');
// Read only from stdin: passwords never enter process arguments, shell history, or command output.
const password = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
const db = new PrismaClient({ adapter: createPrismaAdapter(assertDatabaseUrl(process.env.DATABASE_URL)) });
try {
  const action = command === 'create' ? createAdminAccount : resetAdminPassword;
  const account = await action(db, username, password);
  process.stdout.write(`${JSON.stringify(account)}\n`);
} catch {
  // Prisma validation errors may include input; never print them with password material.
  process.stderr.write(
    'Administrator account update failed. Check the ID, database and password (8–128 characters).\n',
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
