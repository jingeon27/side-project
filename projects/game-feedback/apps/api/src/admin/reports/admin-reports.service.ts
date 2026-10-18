import { type ReviewReportDto, type HideContentDto } from './report-input.dto';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';
import type { SessionRequest } from '../../auth/session.types';
import { requireAdmin } from '../../auth/session-access';
import { ApiError } from '../../common/http/api-error';
@Injectable()
export class AdminReportsService {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}
  async hide(req: SessionRequest, input: HideContentDto) {
    const u = requireAdmin(req);
    await this.db.$transaction(async (tx) => {
      const data = { hidden: input.hidden };
      if (input.targetType === 'POST') await tx.post.update({ where: { id: input.targetId }, data });
      if (input.targetType === 'ANSWER') await tx.answer.update({ where: { id: input.targetId }, data });
      if (input.targetType === 'COMMENT') await tx.comment.update({ where: { id: input.targetId }, data });
      if (input.hidden) {
        if (input.targetType === 'POST')
          await tx.notification.deleteMany({ where: { postId: input.targetId } });
        if (input.targetType === 'ANSWER')
          await tx.notification.deleteMany({ where: { answerId: input.targetId } });
      }
      await tx.auditLog.create({
        data: {
          actorId: u.id,
          action: input.hidden ? 'HIDE' : 'UNHIDE',
          targetType: input.targetType,
          targetId: input.targetId,
          detail: input.reason,
        },
      });
    });
    return { ok: true };
  }
  async reports(req: SessionRequest) {
    requireAdmin(req);
    const rows = await this.db.report.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    const ids = (type: string) => rows.filter((row) => row.targetType === type).map((row) => row.targetId);
    const [posts, answers, comments] = await Promise.all([
      this.db.post.findMany({
        where: { id: { in: ids('POST') } },
        select: { id: true, authorId: true, title: true, body: true },
      }),
      this.db.answer.findMany({
        where: { id: { in: ids('ANSWER') } },
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
    await this.db.$transaction(async (tx) => {
      if (!(await tx.report.findUnique({ where: { id } })))
        throw new ApiError(404, 'REPORT_NOT_FOUND', '신고를 찾을 수 없습니다.');
      await tx.report.update({ where: { id }, data: { status } });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: `REPORT_${status}`,
          targetType: 'REPORT',
          targetId: id,
          detail: '신고 검토 상태 변경',
        },
      });
    });
    return { ok: true };
  }
}
