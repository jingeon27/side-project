import { CacheInvalidationService } from '../cache-invalidation/cache-invalidation.service';
import { postCacheTag } from '@game-feedback/contracts';
import { uniq } from 'es-toolkit';
import { PrismaClient } from '../generated/prisma';

import { Inject, Injectable } from '@nestjs/common';
import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { ACTIVE_CONTENT, ACTIVE_POST } from '../common/content';
import { ApiError } from '../common/http/api-error';
import { PostsService } from '../posts/posts.service';
import { UserVisibilityService } from '../users/user-visibility.service';
import { authorSelect } from '../users/user.presenter';
import type { CommentBodyDto, CreateCommentBodyDto } from './comment-input.dto';
import { responseComment } from './comment.presenter';
import { activeCommentWhere } from './comment-visibility';

@Injectable()
export class CommentsService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(CacheInvalidationService) private readonly cache: CacheInvalidationService,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
    @Inject(PostsService) private readonly posts: PostsService,
  ) {}
  async createComment(req: SessionRequest, postId: string, input: CreateCommentBodyDto) {
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
          await tx.notification.createMany({
            data: recipients.map((userId) => ({
              actorId: u.id,
              userId,
              postId,
              commentId: row.id,
              type: parent ? 'COMMENT_REPLY' : 'COMMENT',
              message: `${u.nickname}님이 ${parent ? '답글' : '댓글'}을 남겼어요.`,
            })),
          });
        return row;
      },
      [postCacheTag(postId)],
    );
    return responseComment(c);
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
  async updateComment(req: SessionRequest, id: string, input: CommentBodyDto) {
    const u = requireUser(req),
      c = await this.visibleComment(req, id);
    if (c.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '작성자만 수정할 수 있습니다.');
    return responseComment(
      await this.cache.change(
        (tx) =>
          tx.comment.update({
            where: { id },
            data: { body: input.body },
            include: { author: { select: authorSelect } },
          }),
        [postCacheTag(c.postId)],
      ),
    );
  }
  async deleteComment(req: SessionRequest, id: string) {
    const u = requireUser(req),
      c = await this.visibleComment(req, id);
    if (c.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '작성자만 삭제할 수 있습니다.');
    await this.cache.change(
      async (tx) => {
        await tx.comment.update({ where: { id }, data: { deletedAt: new Date(), body: '' } });
        await tx.notification.deleteMany({ where: { commentId: id } });
      },
      [postCacheTag(c.postId)],
    );
    return { ok: true };
  }
}
