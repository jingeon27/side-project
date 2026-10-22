import type { Comment } from '@game-feedback/contracts';

import { decodeCursor, encodeCursor } from '../common/pagination';
import type { Prisma, PrismaClient } from '../generated/prisma';
import { authorSelect } from '../users/user.presenter';
import { responseComment } from './comment.presenter';

/** 상세에 싣는 원댓글 스레드 수. 이전 스레드는 `GET /api/posts/:id/comments`로 받는다. */
export const COMMENT_THREAD_PAGE = 30;
/** 한 페이지에 싣는 답글 상한. 넘치면 가장 최근 답글을 남긴다. */
export const COMMENT_REPLY_LIMIT = 200;

function visibleReply(excluded: string[]) {
  return { hidden: false, deletedAt: null, authorId: { notIn: excluded } } satisfies Prisma.CommentWhereInput;
}
/** 숨기지 않은 원댓글 중 보이는 작성자의 것, 또는 보이는 답글이 남은 삭제 자리표시자. */
function visibleRoot(excluded: string[]) {
  return {
    parentId: null,
    hidden: false,
    OR: [
      { deletedAt: null, authorId: { notIn: excluded } },
      { deletedAt: { not: null }, replies: { some: visibleReply(excluded) } },
    ],
  } satisfies Prisma.CommentWhereInput;
}

/**
 * 최근 원댓글 스레드부터 `limit`개를 고르고 그 답글을 함께 돌려준다. 새 댓글이 항상 첫 페이지에 보이도록
 * 최신부터 나누며, 페이지 안은 오래된 순이다. `nextCursor`는 이 페이지보다 이전 스레드를 가리킨다.
 */
export async function commentThreadPage(
  db: Pick<PrismaClient, 'comment'>,
  postId: string,
  excluded: string[],
  options: { cursor?: string; limit: number },
): Promise<{ items: Comment[]; nextCursor: string | null }> {
  const cursor = decodeCursor(options.cursor);
  const roots = await db.comment.findMany({
    where: {
      postId,
      AND: [
        visibleRoot(excluded),
        ...(cursor
          ? [
              {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              },
            ]
          : []),
      ],
    },
    include: { author: { select: authorSelect } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: options.limit + 1,
  });
  const page = roots.slice(0, options.limit);
  const replies = page.length
    ? await db.comment.findMany({
        where: { postId, parentId: { in: page.map((root) => root.id) }, ...visibleReply(excluded) },
        include: { author: { select: authorSelect } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: COMMENT_REPLY_LIMIT,
      })
    : [];
  const oldest = page[page.length - 1];
  return {
    items: [...page, ...replies]
      .sort(
        (left, right) =>
          left.createdAt.getTime() - right.createdAt.getTime() || (left.id < right.id ? -1 : 1),
      )
      .map(responseComment),
    nextCursor: roots.length > options.limit && oldest ? encodeCursor(oldest) : null,
  };
}
