import { ACTIVE_CONTENT } from '../common/content';
import type { Prisma } from '../generated/prisma';

export interface IAnswerCounts {
  answerCount: number;
  helpfulCount: number;
}
export const NO_ANSWERS: IAnswerCounts = { answerCount: 0, helpfulCount: 0 };

/**
 * 글마다 보이는 답변 수와 도움됨 수. 답변 행을 읽지 않고 (postId, helpful) 그룹 개수 한 번으로 센다.
 * 상세·목록과 같은 가시성(활성 답변 + 숨길 작성자 제외)을 쓴다.
 */
export async function answerCounts(
  db: Pick<Prisma.TransactionClient, 'answer'>,
  postIds: readonly string[],
  excluded: string[],
): Promise<ReadonlyMap<string, IAnswerCounts>> {
  if (!postIds.length) return new Map();
  const groups = await db.answer.groupBy({
    by: ['postId', 'helpful'],
    where: { postId: { in: [...postIds] }, ...ACTIVE_CONTENT, authorId: { notIn: excluded } },
    _count: { _all: true },
  });
  const counts = new Map<string, IAnswerCounts>();
  for (const group of groups) {
    const current = counts.get(group.postId) ?? NO_ANSWERS;
    counts.set(group.postId, {
      answerCount: current.answerCount + group._count._all,
      helpfulCount: current.helpfulCount + (group.helpful ? group._count._all : 0),
    });
  }
  return counts;
}
