import { Inject, Injectable } from '@nestjs/common';

import type { SessionRequest } from '../auth/session.types';
import { ACTIVE_POST } from '../common/content';
import { hash } from '../common/crypto';
import { ApiError } from '../common/http/api-error';
import { UnitOfWork } from '../database/unit-of-work';
import { PrismaClient } from '../generated/prisma';
import { UserVisibilityService } from '../users/user-visibility.service';
import type { PostViewDto } from './post-input.dto';

/** 같은 IP·User-Agent에서 한 글에 24시간 동안 세는 익명 방문자 수의 상한. */
export const ANONYMOUS_VIEWS_PER_NETWORK = 5;

@Injectable()
export class PostViewsService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
  ) {}

  /**
   * 조회수는 공개 상세 캐시 문서를 무효화하지 않는다. 캐시 문서의 viewCount는 마지막 내용 변경 때의 값이고,
   * 화면은 이 응답과 클라이언트 재조회로 최신 값을 보여준다.
   */
  async record(req: SessionRequest, id: string, body: PostViewDto) {
    const user = req.gfSession?.user;
    const visitorHash = hash(user ? `user:${user.id}` : `visitor:${body.visitorId}`);
    // 익명 visitorId는 클라이언트가 정하므로 서버가 본 IP·User-Agent로 같은 출처의 집계 수를 묶는다.
    const networkHash = user ? null : hash(`network:${req.ip ?? ''}:${req.get('user-agent') ?? ''}`);
    const excluded = await this.visibility.excluded(req);
    const viewCount = await this.transactions.run(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Post" WHERE "id" = ${id} FOR UPDATE`;
      const post = await (tx ?? this.db).post.findFirst({
        where: { id, ...ACTIVE_POST, authorId: { notIn: excluded } },
        select: { id: true, updatedAt: true, viewCount: true },
      });
      if (!post) throw new ApiError(404, 'POST_NOT_FOUND', '게시글을 찾을 수 없습니다.');
      if (networkHash) {
        const [recent] = await tx.$queryRaw<Array<{ count: number }>>`
          SELECT COUNT(*)::int AS "count" FROM "PostView"
          WHERE "postId" = ${id} AND "networkHash" = ${networkHash}
            AND "lastViewedAt" > CURRENT_TIMESTAMP - INTERVAL '24 hours'
        `;
        if ((recent?.count ?? 0) >= ANONYMOUS_VIEWS_PER_NETWORK) return post.viewCount;
      }
      const counted = await tx.$executeRaw`
        INSERT INTO "PostView" ("postId", "visitorHash", "networkHash", "lastViewedAt")
        VALUES (${id}, ${visitorHash}, ${networkHash}, CURRENT_TIMESTAMP)
        ON CONFLICT ("postId", "visitorHash") DO UPDATE
          SET "lastViewedAt" = CURRENT_TIMESTAMP, "networkHash" = EXCLUDED."networkHash"
        WHERE "PostView"."lastViewedAt" <= CURRENT_TIMESTAMP - INTERVAL '24 hours'
      `;
      if (!counted) return post.viewCount;
      const updated = await (tx ?? this.db).post.update({
        where: { id },
        data: { viewCount: { increment: counted }, updatedAt: post.updatedAt },
        select: { viewCount: true },
      });
      return updated.viewCount;
    });
    return { viewCount };
  }
}
