import { UnitOfWork } from '../../database/unit-of-work';
import { ReportsRepository } from './reports.repository';
import { type ReviewReportDto, type HideContentDto } from './report-input.dto';
import { Inject, Injectable } from '@nestjs/common';
import type { SessionRequest } from '../../auth/session.types';
import { requireAdmin } from '../../auth/session-access';
import { ApiError } from '../../common/http/api-error';
import { match } from 'ts-pattern';
import { groupBy, uniq } from 'es-toolkit';
import { hiddenNotificationScope } from './report.policy';
@Injectable()
export class AdminReportsService {
  constructor(
    @Inject(ReportsRepository) private readonly repository: ReportsRepository,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
  ) {}
  async hide(req: SessionRequest, input: HideContentDto) {
    const u = requireAdmin(req);
    await this.transactions.run(async (tx) => {
      const data = { hidden: input.hidden };
      await match(input.targetType)
        .with('POST', () => this.repository.updatePost({ where: { id: input.targetId }, data }, tx))
        .with('ANSWER', () => this.repository.updateAnswer({ where: { id: input.targetId }, data }, tx))
        .with('COMMENT', () => this.repository.updateComment({ where: { id: input.targetId }, data }, tx))
        .exhaustive();
      const scope = hiddenNotificationScope(input);
      if (scope) await this.repository.deleteManyNotification({ where: scope }, tx);
      await this.repository.createAuditLog(
        {
          data: {
            actorId: u.id,
            action: input.hidden ? 'HIDE' : 'UNHIDE',
            targetType: input.targetType,
            targetId: input.targetId,
            detail: input.reason,
          },
        },
        tx,
      );
    });
    return { ok: true };
  }
  async reports(req: SessionRequest) {
    requireAdmin(req);
    const rows = await this.repository.findManyReport({ orderBy: { createdAt: 'desc' }, take: 100 });
    const grouped = groupBy(rows, (row) => row.targetType);
    const ids = (type: string) => uniq((grouped[type] ?? []).map((row) => row.targetId));
    const [posts, answers, comments] = await Promise.all([
      this.repository.findManyPost({
        where: { id: { in: ids('POST') } },
        select: { id: true, authorId: true, title: true, body: true },
      }),
      this.repository.findManyAnswer({
        where: { id: { in: ids('ANSWER') } },
        select: { id: true, authorId: true, postId: true, body: true },
      }),
      this.repository.findManyComment({
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
      if (!(await this.repository.findUniqueReport({ where: { id } }, tx)))
        throw new ApiError(404, 'REPORT_NOT_FOUND', '신고를 찾을 수 없습니다.');
      await this.repository.updateReport({ where: { id }, data: { status } }, tx);
      await this.repository.createAuditLog(
        {
          data: {
            actorId: admin.id,
            action: `REPORT_${status}`,
            targetType: 'REPORT',
            targetId: id,
            detail: '신고 검토 상태 변경',
          },
        },
        tx,
      );
    });
    return { ok: true };
  }
}
