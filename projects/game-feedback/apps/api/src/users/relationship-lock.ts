import type { Prisma } from '../generated/prisma';

/** 두 사용자 사이의 차단·팔로우 변경을 순서와 무관하게 한 트랜잭션 잠금으로 직렬화한다. */
export function lockUserRelationship(client: Prisma.TransactionClient, first: string, second: string) {
  const key = `user-relationship:${[first, second].sort().join(':')}`;
  return client.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
}
