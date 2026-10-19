import { UnitOfWork } from '../database/unit-of-work';
import { CommentsRepository } from './comments.repository';
import type { CommentBodyDto } from './comment-input.dto';
import { ACTIVE_CONTENT } from '../common/content';
import { UserVisibilityService } from '../users/user-visibility.service';
import { authorSelect } from '../users/user.presenter';
import { PostsService } from '../posts/posts.service';
import { responseComment } from './comment.presenter';
import { Inject, Injectable } from '@nestjs/common';
import type { SessionRequest } from '../auth/session.types';
import { requireUser } from '../auth/session-access';
import { ApiError } from '../common/http/api-error';

@Injectable()
export class CommentsService {
  constructor(
    @Inject(CommentsRepository) private readonly repository: CommentsRepository,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
    @Inject(PostsService) private readonly posts: PostsService,
  ) {}
  async createComment(req: SessionRequest, postId: string, input: CommentBodyDto) {
    const u = requireUser(req),
      p = await this.posts.visiblePost(req, postId);
    const c = await this.transactions.run(async (tx) => {
      const row = await this.repository.createComment(
        {
          data: { postId, authorId: u.id, body: input.body },
          include: { author: { select: authorSelect } },
        },
        tx,
      );
      if (p.authorId !== u.id)
        await this.repository.createNotification(
          {
            data: {
              actorId: u.id,
              userId: p.authorId,
              postId,
              type: 'COMMENT',
              message: `${u.nickname}님이 댓글을 남겼어요.`,
            },
          },
          tx,
        );
      return row;
    });
    return responseComment(c);
  }
  async visibleComment(req: SessionRequest, id: string) {
    const c = await this.repository.findFirstComment({
      where: { id, ...ACTIVE_CONTENT },
      include: { author: { select: authorSelect } },
    });
    if (!c) throw new ApiError(404, 'COMMENT_NOT_FOUND', '댓글을 찾을 수 없습니다.');
    await this.posts.visiblePost(req, c.postId);
    if ((await this.visibility.excluded(req)).includes(c.authorId))
      throw new ApiError(404, 'COMMENT_NOT_FOUND', '댓글을 찾을 수 없습니다.');
    return c;
  }
  async updateComment(req: SessionRequest, id: string, input: CommentBodyDto) {
    const u = requireUser(req),
      c = await this.visibleComment(req, id);
    if (c.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '작성자만 수정할 수 있습니다.');
    return responseComment(
      await this.repository.updateComment({
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
    await this.repository.updateComment({ where: { id }, data: { deletedAt: new Date(), body: '' } });
    return { ok: true };
  }
}
