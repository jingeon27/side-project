import type { Prisma } from '../generated/prisma';
import { authorDto, authorSelect } from '../users/user.presenter';

type AnswerRecord = Prisma.AnswerGetPayload<{ include: { author: { select: typeof authorSelect } } }>;
export const responseAnswer = (a: AnswerRecord) => ({
  id: a.id,
  postId: a.postId,
  body: a.body,
  author: authorDto(a.author),
  helpful: a.helpful,
  readAt: a.readAt?.toISOString() ?? null,
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
});
