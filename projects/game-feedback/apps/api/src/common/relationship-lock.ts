import type { Prisma } from '../generated/prisma';

export async function lockUserRelationship(tx: Prisma.TransactionClient, first: string, second: string) {
  const key = `user-relationship:${[first, second].sort().join(':')}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
}
