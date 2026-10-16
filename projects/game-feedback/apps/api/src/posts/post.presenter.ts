import type { Prisma } from '../generated/prisma';
import { authorDto, authorSelect } from '../users/user.presenter';
import { ACTIVE_CONTENT } from '../common/content';
export const postInclude = {
  author: { select: authorSelect },
  category: true,
  answers: { where: ACTIVE_CONTENT, select: { id: true, helpful: true } },
} as const;

type PostRecord = Prisma.PostGetPayload<{ include: typeof postInclude }>;
export const responsePost = (p: PostRecord) => ({
  id: p.id,
  title: p.title,
  body: p.body,
  categoryId: p.categoryId,
  category: p.category,
  author: authorDto(p.author),
  gameProfile: p.gameProfile,
  answerCount: p.answers.length,
  helpfulCount: p.answers.filter((a) => a.helpful).length,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});
