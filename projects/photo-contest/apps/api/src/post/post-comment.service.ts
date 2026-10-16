import { Injectable } from '@nestjs/common';

import type { PostComment } from '../../generated/prisma';
import { ANALYTICS_EVENT, recordEvent } from '../analytics/analytics-event';
import type { IViewer } from '../auth/session.service';
import { USER_VIEW_SELECT, type IUserView } from '../auth/user-view';
import { ERROR_CODE, fail } from '../common/errors';
import { pageRange, textValue } from '../common/validation';
import { COMMENT_BODY_LIMIT, PAGE_SIZE_DEFAULT } from '../config/limits';
import { Database } from '../database/database.service';
import { MembershipService } from '../group/membership.service';

interface ICommentView {
  id: string;
  postId: string;
  body: string;
  author: IUserView;
  createdAt: Date;
  canDelete: boolean;
}

function present(row: PostComment & { author: IUserView }, viewerId: string, admin: boolean): ICommentView {
  return {
    id: row.id,
    postId: row.postId,
    body: row.body,
    author: row.author,
    createdAt: row.createdAt,
    canDelete: admin || row.authorId === viewerId,
  };
}

@Injectable()
export class PostCommentService {
  constructor(
    private readonly db: Database,
    private readonly membership: MembershipService,
  ) {}

  async list(viewer: IViewer, postId: string, offset?: number | null, limit?: number | null) {
    const range = pageRange(offset ?? 0, limit ?? PAGE_SIZE_DEFAULT);
    const { admin } = await this.membership.accessiblePost(viewer.id, postId);
    const rows = await this.db.postComment.findMany({
      where: { postId },
      include: { author: { select: USER_VIEW_SELECT } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: range.offset,
      take: range.limit,
    });
    return rows.map((row) => present(row, viewer.id, admin));
  }

  async create(viewer: IViewer, postId: string, input: unknown) {
    const body = textValue(input, COMMENT_BODY_LIMIT, '댓글');
    return this.db.atomic(async (tx) => {
      const { admin } = await this.membership.accessiblePost(viewer.id, postId, tx);
      const row = await tx.postComment.create({
        data: { postId, authorId: viewer.id, body },
        include: { author: { select: USER_VIEW_SELECT } },
      });
      await recordEvent(tx, {
        id: `comment-created:${row.id}`,
        type: ANALYTICS_EVENT.COMMENT_CREATED,
        userId: viewer.id,
        properties: { commentId: row.id, postId },
      });
      return present(row, viewer.id, admin);
    });
  }

  async delete(viewer: IViewer, commentId: string) {
    return this.db.atomic(async (tx) => {
      const row = await tx.postComment.findUnique({ where: { id: commentId } });
      if (!row) fail('댓글을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
      const { admin } = await this.membership.accessiblePost(viewer.id, row.postId, tx);
      if (!admin && row.authorId !== viewer.id)
        fail('작성자와 그룹 관리자만 댓글을 삭제할 수 있습니다.', ERROR_CODE.FORBIDDEN);
      await tx.postComment.delete({ where: { id: commentId } });
      await recordEvent(tx, {
        id: `comment-deleted:${commentId}`,
        type: ANALYTICS_EVENT.COMMENT_DELETED,
        userId: viewer.id,
        properties: { commentId, postId: row.postId },
      });
      return true;
    });
  }
}
