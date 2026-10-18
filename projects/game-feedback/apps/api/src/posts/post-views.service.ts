import type { PostViewDto } from './post-input.dto';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';
import type { SessionRequest } from '../auth/session.types';
import { hash } from '../common/crypto';
import { ACTIVE_POST } from '../common/content';
import { ApiError } from '../common/http/api-error';
import { UserVisibilityService } from '../users/user-visibility.service';

@Injectable()
export class PostViewsService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
  ) {}

  async record(req: SessionRequest, id: string, body: PostViewDto) {
    const { visitorId } = body;
    const excluded = await this.visibility.excluded(req);
    const visitorHash = hash(req.gfSession?.user ? `user:${req.gfSession.user.id}` : `visitor:${visitorId}`);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Post" WHERE "id" = ${id} FOR UPDATE`;
      const post = await tx.post.findFirst({
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
      return tx.post.update({
        where: { id },
        data: { viewCount: { increment: counted }, updatedAt: post.updatedAt },
        select: { viewCount: true },
      });
    });
  }
}
