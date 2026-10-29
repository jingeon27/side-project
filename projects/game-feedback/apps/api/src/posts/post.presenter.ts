import type { Prisma } from '../generated/prisma';
import { authorDto, authorSelect } from '../users/user.presenter';
import { NO_ANSWERS, type IAnswerCounts } from './post-answer-counts';

export const postInclude = {
  author: { select: authorSelect },
  category: true,
} as const;

type PostRecord = Prisma.PostGetPayload<{ include: typeof postInclude }>;
export const responsePost = (p: PostRecord, counts: IAnswerCounts = NO_ANSWERS) => ({
  id: p.id,
  title: p.title,
  body: p.body,
  board: p.board,
  document: p.document,
  coaching: p.coaching,
  friendSale: p.friendSale,
  battle: p.battle,
  categoryId: p.categoryId,
  category: p.category,
  author: authorDto(p.author),
  gameProfile: p.gameProfile,
  viewCount: p.viewCount,
  answerCount: counts.answerCount,
  helpfulCount: counts.helpfulCount,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});
