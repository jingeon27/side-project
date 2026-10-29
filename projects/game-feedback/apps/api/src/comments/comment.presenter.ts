import type { Comment } from '@game-feedback/contracts';

import type { Prisma } from '../generated/prisma';
import { authorDto, authorSelect } from '../users/user.presenter';

type CommentRecord = Prisma.CommentGetPayload<{ include: { author: { select: typeof authorSelect } } }>;
export const responseComment = (
  c: CommentRecord,
  replies: Pick<Comment, 'replyCount' | 'repliesCursor'> = { replyCount: 0, repliesCursor: null },
): Comment => {
  const shared = {
    ...replies,
    id: c.id,
    postId: c.postId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
  if (c.deletedAt) return { ...shared, parentId: null, isDeleted: true, body: '', author: null };
  return { ...shared, parentId: c.parentId, isDeleted: false, body: c.body, author: authorDto(c.author) };
};
