import { ACTIVE_POST } from '../common/content';
import { CacheInvalidationService } from '../cache-invalidation/cache-invalidation.service';
import { postCacheTag } from '@game-feedback/contracts';
import { PrismaClient } from '../generated/prisma';

import { Inject, Injectable } from '@nestjs/common';
import type { SessionRequest } from '../auth/session.types';
import { hash } from '../common/crypto';
import { ApiError } from '../common/http/api-error';
import { UserVisibilityService } from '../users/user-visibility.service';
import type { PostViewDto } from './post-input.dto';

@Injectable()
export class PostViewsService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(CacheInvalidationService) private readonly cache: CacheInvalidationService,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
  ) {}

  async record(req: SessionRequest, id: string, body: PostViewDto) {
    const { visitorId } = body;
    const excluded = await this.visibility.excluded(req);
    const visitorHash = hash(req.gfSession?.user ? `user:${req.gfSession.user.id}` : `visitor:${visitorId}`);
    const result = await this.cache.change(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Post" WHERE "id" = ${id} FOR UPDATE`;
        const post = await (tx ?? this.db).post.findFirst({
          where: { id, ...ACTIVE_POST, authorId: { notIn: excluded } },
          select: { id: true, updatedAt: true },
        });
        if (!post) throw new ApiError(404, 'POST_NOT_FOUND', '게시글을 찾을 수 없습니다.');
        const counted = await tx.$executeRaw`
      INSERT INTO "PostView" ("postId", "visitorHash", "lastViewedAt")
      VALUES (${id}, ${visitorHash}, CURRENT_TIMESTAMP)
      ON CONFLICT ("postId", "visitorHash") DO UPDATE SET "lastViewedAt" = CURRENT_TIMESTAMP
      WHERE "PostView"."lastViewedAt" <= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    `;
        const updated = await (tx ?? this.db).post.update({
          where: { id },
          data: { viewCount: { increment: counted }, updatedAt: post.updatedAt },
          select: { viewCount: true },
        });
        return { viewCount: updated.viewCount, counted };
      },
      (value) => (value.counted ? [postCacheTag(id)] : []),
    );
    return { viewCount: result.viewCount };
  }
}
