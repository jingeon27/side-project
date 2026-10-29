import { Inject, Injectable } from '@nestjs/common';
import { uniq } from 'es-toolkit';

import { postCacheTag } from '@game-feedback/contracts';

import { requireUser } from '../auth/session/session-access';
import type { SessionRequest } from '../auth/session/session.types';
import { CacheInvalidationService } from '../cache-invalidation/cache-invalidation.service';
import { ACTIVE_CONTENT, ACTIVE_POST } from '../common/content';
import { ApiError } from '../common/http/api-error';
import { type TListQueryDto } from '../common/http/list-query.dto';
import { PrismaClient, type Prisma } from '../generated/prisma';
import { PostsService } from '../posts/posts.service';
import { writePostNotifications } from '../push/post-notification.writer';
import { authorSelect } from '../users/user.presenter';
import { UserVisibilityService } from '../users/visibility/user-visibility.service';
import { type TCommentBodyDto, type TCreateCommentBodyDto } from './comment-input.dto';
import { commentThreadPage } from './comment-page';
import { activeCommentWhere } from './comment-visibility';
import { responseComment } from './comment.presenter';

@Injectable()
export class CommentsService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(CacheInvalidationService) private readonly cache: CacheInvalidationService,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
    @Inject(PostsService) private readonly posts: PostsService,
  ) {}
  async createComment(req: SessionRequest, postId: string, input: TCreateCommentBodyDto) {
    const u = requireUser(req);
    const c = await this.cache.change(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Post" WHERE "id" = ${postId} FOR UPDATE`;
        const excluded = await this.visibility.excluded(req, tx);
        const post = await tx.post.findFirst({
          where: { id: postId, ...ACTIVE_POST, authorId: { notIn: excluded } },
          select: { authorId: true },
        });
        if (!post) throw new ApiError(404, 'POST_NOT_FOUND', '게시글을 찾을 수 없습니다.');
        const parentId = input.parentId ?? null;
        if (parentId) await tx.$queryRaw`SELECT "id" FROM "Comment" WHERE "id" = ${parentId} FOR UPDATE`;
        const parent = parentId
          ? await tx.comment.findFirst({
              where: { id: parentId, postId, ...ACTIVE_CONTENT, authorId: { notIn: excluded } },
              select: { authorId: true, parentId: true },
            })
          : null;
        if (parentId && !parent)
          throw new ApiError(404, 'COMMENT_NOT_FOUND', '답글을 남길 댓글을 찾을 수 없습니다.');
        if (parent?.parentId)
          throw new ApiError(400, 'INVALID_COMMENT_PARENT', '원댓글에 답글을 남겨주세요.');
        const row = await tx.comment.create({
          data: { postId, parentId, authorId: u.id, body: input.body },
          include: { author: { select: authorSelect } },
        });
        const recipients = uniq([post.authorId, ...(parent ? [parent.authorId] : [])]).filter(
          (recipient) => recipient !== u.id,
        );
        if (recipients.length)
          await writePostNotifications(
            tx,
            recipients.map((userId) => ({
              actorId: u.id,
              userId,
              postId,
              commentId: row.id,
              type: parent ? 'COMMENT_REPLY' : 'COMMENT',
            })),
          );
        return row;
      },
      // 태그는 게시글을 확인한 뒤 만든다. 형식이 틀린 id는 태그 검증보다 404가 먼저여야 한다.
      (row) => [postCacheTag(row.postId)],
    );
    return responseComment(c);
  }
  /** 상세 첫 페이지보다 이전의 원댓글 스레드. 게시글 가시성과 차단 관계는 상세와 같다. */
  async page(req: SessionRequest, postId: string, query: TListQueryDto) {
    await this.posts.visiblePost(req, postId);
    return commentThreadPage(this.db, postId, await this.visibility.excluded(req), {
      cursor: query.cursor,
      limit: query.limit,
    });
  }
  async visibleComment(req: SessionRequest, id: string) {
    const excluded = await this.visibility.excluded(req);
    const c = await this.db.comment.findFirst({
      where: { id, ...activeCommentWhere(excluded) },
      include: { author: { select: authorSelect }, parent: true },
    });
    if (!c) throw new ApiError(404, 'COMMENT_NOT_FOUND', '댓글을 찾을 수 없습니다.');
    await this.posts.visiblePost(req, c.postId);
    return c;
  }
  async updateComment(req: SessionRequest, id: string, input: TCommentBodyDto) {
    const u = requireUser(req),
      c = await this.visibleComment(req, id);
    if (c.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '작성자만 수정할 수 있습니다.');
    return responseComment(
      await this.cache.change(
        async (tx) => {
          // createComment와 같은 글 → 댓글 순서로 잠근 뒤 숨김·삭제·차단을 다시 확인한다.
          await tx.$queryRaw`SELECT "id" FROM "Post" WHERE "id" = ${c.postId} FOR UPDATE`;
          await tx.$queryRaw`SELECT "id" FROM "Comment" WHERE "id" = ${id} FOR UPDATE`;
          const excluded = await this.visibility.excluded(req, tx);
          const current = await tx.comment.findFirst({
            where: {
              id,
              ...activeCommentWhere(excluded),
              post: { ...ACTIVE_POST, authorId: { notIn: excluded } },
            },
            select: { id: true },
          });
          if (!current) throw new ApiError(404, 'COMMENT_NOT_FOUND', '댓글을 찾을 수 없습니다.');
          return tx.comment.update({
            where: { id },
            data: { body: input.body },
            include: { author: { select: authorSelect } },
          });
        },
        [postCacheTag(c.postId)],
      ),
    );
  }
  async deleteComment(req: SessionRequest, id: string) {
    const u = requireUser(req);
    await this.cache.change(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Comment" WHERE "id" = ${id} FOR UPDATE`;
        // 작성자 삭제는 소유권만 본다. 숨겨진 댓글이나 숨겨진 원댓글 아래 답글도 지울 수 있다.
        const own = await tx.comment.findFirst({
          where: { id, authorId: u.id, deletedAt: null },
          select: { postId: true },
        });
        if (!own) throw await this.deletionDenied(req, id, tx);
        await tx.comment.update({ where: { id }, data: { deletedAt: new Date(), body: '' } });
        await tx.notification.deleteMany({ where: { commentId: id } });
        return own;
      },
      (own) => [postCacheTag(own.postId)],
    );
    return { ok: true };
  }
  /** 남의 댓글이면 볼 수 있을 때만 403, 볼 수 없거나 이미 지운 댓글은 404로 존재를 숨긴다. */
  private async deletionDenied(req: SessionRequest, id: string, tx: Prisma.TransactionClient) {
    const excluded = await this.visibility.excluded(req, tx);
    const visible = await tx.comment.findFirst({
      where: {
        id,
        ...activeCommentWhere(excluded),
        post: { ...ACTIVE_POST, authorId: { notIn: excluded } },
      },
      select: { id: true },
    });
    return visible
      ? new ApiError(403, 'FORBIDDEN', '작성자만 삭제할 수 있습니다.')
      : new ApiError(404, 'COMMENT_NOT_FOUND', '댓글을 찾을 수 없습니다.');
  }
}
