import { CommentInputSchema } from '@game-feedback/contracts';
import { ACTIVE_CONTENT } from '../common/content';
import { UserVisibilityService } from '../users/user-visibility.service';
import { authorSelect } from '../users/user.presenter';
import { PostsService } from '../posts/posts.service';
import { responseComment } from './comment.presenter';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';
import type { SessionRequest } from '../auth/session.types';
import { requireUser } from '../auth/session-access';
import { parse } from '../common/validation';
import { ApiError } from '../common/http/api-error';

@Injectable()
export class CommentsService {
  constructor(
    @Inject(PrismaClient) readonly db: PrismaClient,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
    @Inject(PostsService) private readonly posts: PostsService,
  ) {}
  async createComment(req: SessionRequest, postId: string, body: unknown) {
    const u = requireUser(req),
      input = parse(CommentInputSchema, body),
      p = await this.posts.visiblePost(req, postId);
    const c = await this.db.$transaction(async (tx) => {
      const row = await tx.comment.create({
        data: { postId, authorId: u.id, body: input.body },
        include: { author: { select: authorSelect } },
      });
      if (p.authorId !== u.id)
        await tx.notification.create({
          data: {
            actorId: u.id,
            userId: p.authorId,
            postId,
            type: 'COMMENT',
            message: `${u.nickname}님이 댓글을 남겼어요.`,
          },
        });
      return row;
    });
    return responseComment(c);
  }
  async visibleComment(req: SessionRequest, id: string) {
    const c = await this.db.comment.findFirst({
      where: { id, ...ACTIVE_CONTENT },
      include: { author: { select: authorSelect } },
    });
    if (!c) throw new ApiError(404, 'COMMENT_NOT_FOUND', '댓글을 찾을 수 없습니다.');
    await this.posts.visiblePost(req, c.postId);
    if ((await this.visibility.excluded(req)).includes(c.authorId))
      throw new ApiError(404, 'COMMENT_NOT_FOUND', '댓글을 찾을 수 없습니다.');
    return c;
  }
  async updateComment(req: SessionRequest, id: string, body: unknown) {
    const u = requireUser(req),
      input = parse(CommentInputSchema, body),
      c = await this.visibleComment(req, id);
    if (c.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '작성자만 수정할 수 있습니다.');
    return responseComment(
      await this.db.comment.update({
        where: { id },
        data: input,
        include: { author: { select: authorSelect } },
      }),
    );
  }
  async deleteComment(req: SessionRequest, id: string) {
    const u = requireUser(req),
      c = await this.visibleComment(req, id);
    if (c.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '작성자만 삭제할 수 있습니다.');
    await this.db.comment.update({ where: { id }, data: { deletedAt: new Date(), body: '' } });
    return { ok: true };
  }
}
