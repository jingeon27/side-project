import { recordEvent } from '../analytics/analytics-event.writer';
import { Database } from '../database/database.service';
import { UnitOfWork } from '../database/unit-of-work';

import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma';
import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import type { IViewer } from '../auth/session.service';
import { USER_VIEW_SELECT } from '../auth/user-view';
import { ERROR_CODE, fail } from '../common/errors';
import { pageRange, textValue } from '../common/validation';
import { COMMENT_BODY_LIMIT, PAGE_SIZE_DEFAULT } from '../config/limits';
import { MembershipService } from '../group/membership.service';

function commentInclude(viewerId: string | null) {
  return {
    author: { select: USER_VIEW_SELECT },
    _count: { select: { likes: true } },
    likes: { where: { userId: viewerId ?? '' }, select: { userId: true } },
  } satisfies Prisma.PostCommentInclude;
}

type TCommentRow = Prisma.PostCommentGetPayload<{ include: ReturnType<typeof commentInclude> }>;

function present(row: TCommentRow, viewerId: string | null, admin: boolean, canInteract: boolean) {
  return {
    id: row.id,
    postId: row.postId,
    body: row.body,
    author: row.author,
    createdAt: row.createdAt,
    canDelete: admin || row.authorId === viewerId,
    likeCount: row._count.likes,
    likedByMe: row.likes.length > 0,
    canInteract,
  };
}

@Injectable()
export class PostCommentService {
  constructor(
    private readonly db: Database,
    private readonly transactions: UnitOfWork,
    private readonly membership: MembershipService,
  ) {}

  async list(viewer: IViewer | null, postId: string, offset?: number | null, limit?: number | null) {
    const range = pageRange(offset ?? 0, limit ?? PAGE_SIZE_DEFAULT);
    const { admin, member } = await this.membership.readablePost(viewer?.id ?? null, postId);
    const rows = await this.db.postComment.findMany({
      where: {
        postId,
      },
      include: commentInclude(viewer?.id ?? null),
      orderBy: [
        { createdAt: 'desc' },
        {
          id: 'desc',
        },
      ],
      skip: range.offset,
      take: range.limit,
    });
    return rows.map((row) => present(row, viewer?.id ?? null, admin, Boolean(member)));
  }

  async create(viewer: IViewer, postId: string, input: unknown) {
    const body = textValue(input, COMMENT_BODY_LIMIT, '댓글');
    return this.transactions.atomic(async (tx) => {
      const { admin } = await this.membership.accessiblePost(viewer.id, postId, tx);
      const row = await (tx ?? this.db).postComment.create({
        data: { postId, authorId: viewer.id, body },
        include: commentInclude(viewer.id),
      });
      await recordEvent(tx ?? this.db, {
        id: `comment-created:${row.id}`,
        type: ANALYTICS_EVENT.COMMENT_CREATED,
        userId: viewer.id,
        properties: { commentId: row.id, postId },
      });
      return present(row, viewer.id, admin, true);
    });
  }

  async like(viewer: IViewer, commentId: string, liked: boolean) {
    return this.transactions.atomic(async (tx) => {
      const row = await tx.postComment.findUnique({ where: { id: commentId } });
      if (!row) fail('댓글을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
      const { admin } = await this.membership.accessiblePost(viewer.id, row.postId, tx);
      if (liked) {
        const { count } = await tx.postCommentLike.createMany({
          data: [{ commentId, userId: viewer.id }],
          skipDuplicates: true,
        });
        if (count > 0)
          await recordEvent(tx, {
            id: `comment-like:${commentId}:${viewer.id}`,
            type: ANALYTICS_EVENT.COMMENT_LIKED,
            userId: viewer.id,
            properties: { commentId, postId: row.postId },
          });
      }
      if (!liked) await tx.postCommentLike.deleteMany({ where: { commentId, userId: viewer.id } });
      const updated = await tx.postComment.findUniqueOrThrow({
        where: { id: commentId },
        include: commentInclude(viewer.id),
      });
      return present(updated, viewer.id, admin, true);
    });
  }

  async delete(viewer: IViewer, commentId: string) {
    return this.transactions.atomic(async (tx) => {
      const row = await (tx ?? this.db).postComment.findUnique({ where: { id: commentId } });
      if (!row) fail('댓글을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
      const { admin } = await this.membership.accessiblePost(viewer.id, row.postId, tx);
      if (!admin && row.authorId !== viewer.id)
        fail('작성자와 그룹 관리자만 댓글을 삭제할 수 있습니다.', ERROR_CODE.FORBIDDEN);
      await (tx ?? this.db).postComment.delete({ where: { id: commentId } });
      await recordEvent(tx ?? this.db, {
        id: `comment-deleted:${commentId}`,
        type: ANALYTICS_EVENT.COMMENT_DELETED,
        userId: viewer.id,
        properties: { commentId, postId: row.postId },
      });
      return true;
    });
  }
}
