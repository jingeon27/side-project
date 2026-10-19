import type { PrismaClient } from '../generated/prisma';
import { hash, token } from '../common/crypto';

/** SSH-only operator tooling; no HTTP endpoint can create or promote an operator. */
export async function requireOperatorUser(db: PrismaClient, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.demoKey || user.bannedAt || user.role !== 'ADMIN')
    throw new Error('An active, non-test ADMIN account is required.');
  return user;
}

export async function grantOperatorRole(db: PrismaClient, userId: string) {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.demoKey || user.bannedAt) throw new Error('An active, non-test user is required.');
    await tx.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });
    await tx.auditLog.create({
      data: {
        actorId: 'operator:cli',
        action: 'GRANT_ADMIN',
        targetType: 'USER',
        targetId: userId,
        detail: 'Granted through the SSH operator CLI.',
      },
    });
    return { userId, role: 'ADMIN' as const };
  });
}

export async function issueOperatorSession(db: PrismaClient, userId: string) {
  await requireOperatorUser(db, userId);
  const accessToken = token();
  const expiresAt = new Date(Date.now() + 3600000);
  await db.$transaction(async (tx) => {
    await tx.session.create({ data: { tokenHash: hash(accessToken), userId, expiresAt } });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: 'ISSUE_OPERATOR_SESSION',
        targetType: 'USER',
        targetId: userId,
        detail: JSON.stringify({ expiresAt: expiresAt.toISOString() }),
      },
    });
  });
  return { accessToken, expiresAt: expiresAt.toISOString() };
}
