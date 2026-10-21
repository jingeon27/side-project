import { UnitOfWork } from '../../database/unit-of-work';
import { PrismaClient } from '../../generated/prisma';

import { Inject, Injectable } from '@nestjs/common';
import { groupBy, uniq } from 'es-toolkit';
import { match } from 'ts-pattern';
import { requireAdmin } from '../../auth/session-access';
import type { SessionRequest } from '../../auth/session.types';
import { ApiError } from '../../common/http/api-error';
import { type HideContentDto, type ReviewReportDto } from './report-input.dto';
import { hiddenNotificationScope } from './report.policy';
import { CacheInvalidationService } from '../../cache-invalidation/cache-invalidation.service';
import { postCacheTag, DISCOVERY_CACHE_TAG } from '@game-feedback/contracts';
@Injectable()
export class AdminReportsService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(CacheInvalidationService) private readonly cache: CacheInvalidationService,
  ) {}
  async hide(req: SessionRequest, input: HideContentDto) {
    const u = requireAdmin(req);
    await this.cache.change(
      async (tx) => {
        const data = { hidden: input.hidden };
        const postId = await match(input.targetType)
          .with('POST', () => tx.post.update({ where: { id: input.targetId }, data }).then((row) => row.id))
          .with('ANSWER', () =>
            tx.answer.update({ where: { id: input.targetId }, data }).then((row) => row.postId),
          )
          .with('COMMENT', () =>
            tx.comment.update({ where: { id: input.targetId }, data }).then((row) => row.postId),
          )
          .exhaustive();
        const scope = hiddenNotificationScope(input);
        if (scope) await (tx ?? this.db).notification.deleteMany({ where: scope });
        await (tx ?? this.db).auditLog.create({
          data: {
            actorId: u.id,
            action: input.hidden ? 'HIDE' : 'UNHIDE',
            targetType: input.targetType,
            targetId: input.targetId,
            detail: input.reason,
          },
        });
        return postId;
      },
      (postId) => [postCacheTag(postId), DISCOVERY_CACHE_TAG],
    );
    return { ok: true };
  }
  async reports(req: SessionRequest) {
    requireAdmin(req);
    const rows = await this.db.report.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const grouped = groupBy(rows, (row) => row.targetType);
    const ids = (type: string) => uniq((grouped[type] ?? []).map((row) => row.targetId));
    const [posts, answers, comments] = await Promise.all([
      this.db.post.findMany({
        where: { id: { in: ids('POST') } },
        select: { id: true, authorId: true, title: true, body: true },
      }),
      this.db.answer.findMany({
        where: {
          id: {
            in: ids('ANSWER'),
          },
        },
        select: { id: true, authorId: true, postId: true, body: true },
      }),
      this.db.comment.findMany({
        where: { id: { in: ids('COMMENT') } },
        select: { id: true, authorId: true, postId: true, body: true },
      }),
    ]);
    const targets = new Map([
      ...posts.map(
        (row) =>
          [row.id, { userId: row.authorId, postId: row.id, preview: `${row.title}\n${row.body}` }] as const,
      ),
      ...[...answers, ...comments].map(
        (row) => [row.id, { userId: row.authorId, postId: row.postId, preview: row.body }] as const,
      ),
    ]);
    return rows.map((row) => ({
      ...row,
      targetUserId: row.targetType === 'USER' ? row.targetId : (targets.get(row.targetId)?.userId ?? null),
      targetPostId: targets.get(row.targetId)?.postId ?? null,
      targetPreview: targets.get(row.targetId)?.preview ?? null,
    }));
  }
  async review(req: SessionRequest, id: string, body: ReviewReportDto) {
    const admin = requireAdmin(req);
    const { status } = body;
    await this.transactions.run(async (tx) => {
      if (!(await (tx ?? this.db).report.findUnique({ where: { id } })))
        throw new ApiError(404, 'REPORT_NOT_FOUND', '신고를 찾을 수 없습니다.');
      await (tx ?? this.db).report.update({ where: { id }, data: { status } });
      await (tx ?? this.db).auditLog.create({
        data: {
          actorId: admin.id,
          action: `REPORT_${status}`,
          targetType: 'REPORT',
          targetId: id,
          detail: '\uC2E0\uACE0 \uAC80\uD1A0 \uC0C1\uD0DC \uBCC0\uACBD',
        },
      });
    });
    return { ok: true };
  }
}
