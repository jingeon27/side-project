import dayjs from 'dayjs';

import type { Comment } from '@game-feedback/contracts';

import { decodeCursor, encodeCursor, nextCursor } from '../common/pagination';
import { Prisma, type PrismaClient } from '../generated/prisma';
import { authorSelect } from '../users/user.presenter';
import { responseComment } from './comment.presenter';

/** 상세에 싣는 원댓글 스레드 수. 이전 스레드는 `GET /api/posts/:id/comments`로 받는다. */
export const COMMENT_THREAD_PAGE = 30;
/** 원댓글마다 먼저 싣는 최근 답글 수. 나머지는 해당 원댓글의 커서로 조회한다. */
export const COMMENT_REPLY_PREVIEW = 6;

function visibleReply(excluded: string[]) {
  return { hidden: false, deletedAt: null, authorId: { notIn: excluded } } satisfies Prisma.CommentWhereInput;
}
/** 숨기지 않은 원댓글 중 보이는 작성자의 것, 또는 보이는 답글이 남은 삭제 자리표시자. */
export function visibleCommentRoot(excluded: string[]) {
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
  db: Pick<PrismaClient, 'comment' | '$queryRaw'>,
  postId: string,
  excluded: string[],
  options: { cursor?: string; limit: number },
): Promise<{ items: Comment[]; nextCursor: string | null }> {
  const cursor = decodeCursor(options.cursor);
  const roots = await db.comment.findMany({
    where: {
      postId,
      AND: [
        visibleCommentRoot(excluded),
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
  // 작성자를 읽기 전에 원댓글별 ID를 제한해 답글이 많은 스레드가 다른 스레드의 답글을 밀어내지 않게 한다.
  const previews = page.length
    ? await db.$queryRaw<Array<{ id: string; parentId: string; replyCount: number; createdAt: Date }>>`
        WITH ranked AS (
          SELECT "id", "parentId", "createdAt",
            (COUNT(*) OVER (PARTITION BY "parentId"))::int AS "replyCount",
            ROW_NUMBER() OVER (PARTITION BY "parentId" ORDER BY "createdAt" DESC, "id" DESC) AS position
          FROM "Comment"
          WHERE "postId" = ${postId} AND "parentId" IN (${Prisma.join(page.map((root) => root.id))})
            AND "hidden" = false AND "deletedAt" IS NULL
            AND ${excluded.length ? Prisma.sql`"authorId" NOT IN (${Prisma.join(excluded)})` : Prisma.sql`TRUE`}
        )
        SELECT "id", "parentId", "createdAt", "replyCount" FROM ranked
        WHERE position <= ${COMMENT_REPLY_PREVIEW}
        ORDER BY "parentId", "createdAt" DESC, "id" DESC
      `
    : [];
  const replies = previews.length
    ? await db.comment.findMany({
        where: { id: { in: previews.map((reply) => reply.id) }, ...visibleReply(excluded) },
        include: { author: { select: authorSelect } },
      })
    : [];
  const rootsWithReplies = page.map((root) => {
    const preview = previews.filter((reply) => reply.parentId === root.id);
    const oldest = preview[preview.length - 1];
    const replyCount = oldest?.replyCount ?? 0;
    return responseComment(root, {
      replyCount,
      repliesCursor: oldest && replyCount > preview.length ? encodeCursor(oldest) : null,
    });
  });
  const oldest = page[page.length - 1];
  return {
    items: [...rootsWithReplies, ...replies.map((reply) => responseComment(reply))].sort(
      (left, right) =>
        dayjs(left.createdAt).valueOf() - dayjs(right.createdAt).valueOf() || (left.id < right.id ? -1 : 1),
    ),
    nextCursor: roots.length > options.limit && oldest ? encodeCursor(oldest) : null,
  };
}

/** 이전 답글은 최신부터 조회한 뒤 오래된 순으로 돌려줘 기존 답글 앞에 이어 붙인다. */
export async function commentReplyPage(
  db: Pick<PrismaClient, 'comment'>,
  postId: string,
  parentId: string,
  excluded: string[],
  options: { cursor?: string; limit: number },
) {
  const cursor = decodeCursor(options.cursor);
  const rows = await db.comment.findMany({
    where: {
      postId,
      parentId,
      ...visibleReply(excluded),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    include: { author: { select: authorSelect } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: options.limit + 1,
  });
  return {
    items: rows
      .slice(0, options.limit)
      .reverse()
      .map((reply) => responseComment(reply)),
    nextCursor: nextCursor(rows, options.limit),
  };
}
