import { Prisma } from '../generated/prisma';

/** 두 사용자 사이의 차단·팔로우 변경을 순서와 무관하게 한 트랜잭션 잠금으로 직렬화한다. */
export async function lockUserRelationship(client: Prisma.TransactionClient, first: string, second: string) {
  // 탈퇴는 사용자부터 잠근다. 서로 반대 방향으로 관계를 바꿔도 같은 순서로 기다린다.
  await client.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${Prisma.join([first, second])}) ORDER BY "id" FOR NO KEY UPDATE`;
  const key = `user-relationship:${[first, second].sort().join(':')}`;
  return client.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
}
