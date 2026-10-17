import { Inject, Injectable } from '@nestjs/common';
import {
  HideInputSchema,
  ReportInputSchema,
  UserBanInputSchema,
  ReportReviewInputSchema,
} from '@game-feedback/contracts';
import { PrismaClient } from '../generated/prisma';
import { requireAdmin, requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { parse } from '../common/validation';
import { PostsService } from '../posts/posts.service';
import { AnswersService } from '../answers/answers.service';
import { CommentsService } from '../comments/comments.service';
import { ApiError } from '../common/http/api-error';
import { userDto } from '../users/user.presenter';
import { ChatEvents } from '../chat/chat.events';

@Injectable()
export class ModerationService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(PostsService) private readonly posts: PostsService,
    @Inject(AnswersService) private readonly answers: AnswersService,
    @Inject(CommentsService) private readonly comments: CommentsService,
    @Inject(ChatEvents) private readonly events: ChatEvents,
  ) {}
  async report(req: SessionRequest, body: unknown) {
    const u = requireUser(req),
      input = parse(ReportInputSchema, body);
    if (input.targetType === 'POST') await this.posts.visiblePost(req, input.targetId);
    if (input.targetType === 'ANSWER') await this.answers.visibleAnswer(req, input.targetId);
    if (input.targetType === 'COMMENT') await this.comments.visibleComment(req, input.targetId);
    if (input.targetType === 'USER') {
      if (input.targetId === u.id)
        throw new ApiError(400, 'CANNOT_REPORT_SELF', '자신을 신고할 수 없습니다.');
      if (!(await this.db.user.findUnique({ where: { id: input.targetId } })))
        throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
    }
    await this.db.report.upsert({
      where: {
        reporterId_targetType_targetId: {
          reporterId: u.id,
          targetType: input.targetType,
          targetId: input.targetId,
        },
      },
      update: {},
      create: { reporterId: u.id, ...input },
    });
    return { ok: true };
  }
  async hide(req: SessionRequest, body: unknown) {
    const u = requireAdmin(req),
      input = parse(HideInputSchema, body);
    await this.db.$transaction(async (tx) => {
      const data = { hidden: input.hidden };
      if (input.targetType === 'POST') await tx.post.update({ where: { id: input.targetId }, data });
      else if (input.targetType === 'ANSWER') await tx.answer.update({ where: { id: input.targetId }, data });
      else await tx.comment.update({ where: { id: input.targetId }, data });
      if (input.hidden) {
        if (input.targetType === 'POST')
          await tx.notification.deleteMany({ where: { postId: input.targetId } });
        else if (input.targetType === 'ANSWER')
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
  async user(req: SessionRequest, id: string) {
    requireAdmin(req);
    const user = await this.db.user.findUnique({ where: { id } });
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
    return userDto(user);
  }
  async review(req: SessionRequest, id: string, body: unknown) {
    const admin = requireAdmin(req);
    const { status } = parse(ReportReviewInputSchema, body);
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
  async ban(req: SessionRequest, id: string, body: unknown) {
    const admin = requireAdmin(req);
    const input = parse(UserBanInputSchema, body);
    const user = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
      if (target.role === 'ADMIN')
        throw new ApiError(400, 'ADMIN_PROTECTED', '관리자 계정은 제재할 수 없습니다.');
      const updated = await tx.user.update({
        where: { id },
        data: {
          bannedAt: input.banned ? (target.bannedAt ?? new Date()) : null,
          banReason: input.banned ? input.reason : null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: input.banned ? 'BAN_USER' : 'UNBAN_USER',
          targetType: 'USER',
          targetId: id,
          detail: input.reason,
        },
      });
      return updated;
    });
    this.events.closeUser(id);
    return userDto(user);
  }
}
