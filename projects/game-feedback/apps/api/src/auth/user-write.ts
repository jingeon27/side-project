import { ApiError } from '../common/http/api-error';
import type { Prisma } from '../generated/prisma';

/** 탈퇴와 같은 사용자 잠금을 먼저 잡아 인증 이후 대기한 요청이 개인정보를 다시 남기지 않게 한다. */
export async function lockActiveUser({
  client,
  userId,
}: {
  client: Prisma.TransactionClient;
  userId: string;
}) {
  // 다른 사용자의 FK 참조는 막지 않으면서 탈퇴·제재의 사용자 변경과 직렬화한다.
  await client.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`;
  const user = await client.user.findUnique({ where: { id: userId } });
  if (!user || user.withdrawnAt) throw new ApiError(401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
  return user;
}
