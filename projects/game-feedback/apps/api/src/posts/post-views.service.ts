import { UnitOfWork } from '../database/unit-of-work';
import { PostsRepository } from './posts.repository';
import type { PostViewDto } from './post-input.dto';
import { Inject, Injectable } from '@nestjs/common';
import type { SessionRequest } from '../auth/session.types';
import { hash } from '../common/crypto';
import { ACTIVE_POST } from '../common/content';
import { ApiError } from '../common/http/api-error';
import { UserVisibilityService } from '../users/user-visibility.service';

@Injectable()
export class PostViewsService {
  constructor(
    @Inject(PostsRepository) private readonly repository: PostsRepository,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
  ) {}

  async record(req: SessionRequest, id: string, body: PostViewDto) {
    const { visitorId } = body;
    const excluded = await this.visibility.excluded(req);
    const visitorHash = hash(req.gfSession?.user ? `user:${req.gfSession.user.id}` : `visitor:${visitorId}`);
    return this.transactions.run(async (tx) => {
      await this.repository.lockPost(id, tx);
      const post = await this.repository.findFirstPost(
        {
          where: { id, ...ACTIVE_POST, authorId: { notIn: excluded } },
          select: { id: true, updatedAt: true },
        },
        tx,
      );
      if (!post) throw new ApiError(404, 'POST_NOT_FOUND', '게시글을 찾을 수 없습니다.');
      const counted = await this.repository.recordUniqueView(id, visitorHash, tx);
      return this.repository.updatePost(
        {
          where: { id },
          data: { viewCount: { increment: counted }, updatedAt: post.updatedAt },
          select: { viewCount: true },
        },
        tx,
      );
    });
  }
}
