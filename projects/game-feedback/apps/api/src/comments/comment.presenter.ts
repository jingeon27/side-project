import type { Prisma } from '../generated/prisma';
import { authorDto, authorSelect } from '../users/user.presenter';

type CommentRecord = Prisma.CommentGetPayload<{ include: { author: { select: typeof authorSelect } } }>;
export const responseComment = (c: CommentRecord) => ({
  id: c.id,
  postId: c.postId,
  body: c.body,
  author: authorDto(c.author),
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});
