import { AdminLoginInputSchema } from '@game-feedback/contracts';

import type { PrismaClient } from '../../generated/prisma';
import { hashAdminPassword } from './admin-password';

/** Trusted CLI only: creates a separate support identity, never promotes a public user. */
export async function createAdminAccount(db: PrismaClient, username: string, password: string) {
  const input = AdminLoginInputSchema.parse({ username, password });
  const passwordHash = await hashAdminPassword(input.password);
  return db.$transaction(async (tx) => {
    const account = await tx.adminAccount.create({
      data: {
        username: input.username,
        passwordHash,
        user: {
          create: { nickname: '운영자', role: 'ADMIN', termsVersion: 'admin-service', ageConfirmed: true },
        },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: 'operator:cli',
        action: 'CREATE_ADMIN_ACCOUNT',
        targetType: 'ADMIN_ACCOUNT',
        targetId: account.id,
        detail: 'Created a dedicated administrator through the trusted CLI.',
      },
    });
    return { id: account.id, username: account.username, userId: account.userId };
  });
}
export async function resetAdminPassword(db: PrismaClient, username: string, password: string) {
  const input = AdminLoginInputSchema.parse({ username, password });
  const passwordHash = await hashAdminPassword(input.password);
  return db.$transaction(async (tx) => {
    const account = await tx.adminAccount.update({
      where: { username: input.username },
      data: { passwordHash },
    });
    await tx.adminSession.deleteMany({ where: { accountId: account.id } });
    await tx.auditLog.create({
      data: {
        actorId: 'operator:cli',
        action: 'RESET_ADMIN_PASSWORD',
        targetType: 'ADMIN_ACCOUNT',
        targetId: account.id,
        detail: 'Password reset; all admin sessions revoked.',
      },
    });
    return { id: account.id, username: account.username };
  });
}
