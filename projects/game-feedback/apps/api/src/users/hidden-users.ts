import type { AppConfig } from '../config/app.config';
import type { Prisma } from '../generated/prisma';

type THiddenUserReader = Pick<Prisma.TransactionClient, 'user' | 'block'>;

/**
 * 보는 사람에게 숨길 사용자: 데모·테스트 인증이 모두 꺼진 앱의 테스트 계정(`demoKey`)과, 로그인했다면 그와
 * 양방향으로 차단 관계인 사용자. 공개 콘텐츠와 채팅이 같은 규칙을 쓴다.
 */
export async function hiddenUserIds(
  db: THiddenUserReader,
  config: Pick<AppConfig, 'demoMode' | 'testAuthEnabled'>,
  viewerId?: string | null,
) {
  const testAccounts =
    config.demoMode || config.testAuthEnabled
      ? []
      : await db.user.findMany({ where: { demoKey: { not: null } }, select: { id: true } });
  const blocks = viewerId
    ? await db.block.findMany({
        where: { OR: [{ userId: viewerId }, { blockedUserId: viewerId }] },
        select: { userId: true, blockedUserId: true },
      })
    : [];
  return [
    ...new Set([
      ...testAccounts.map((user) => user.id),
      ...blocks.map((block) => (block.userId === viewerId ? block.blockedUserId : block.userId)),
    ]),
  ];
}
