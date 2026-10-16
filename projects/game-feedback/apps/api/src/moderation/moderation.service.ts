import { Inject, Injectable } from '@nestjs/common';
import { HideInputSchema, ReportInputSchema } from '@game-feedback/contracts';
import { PrismaClient } from '../generated/prisma';
import { requireAdmin, requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { parse } from '../common/validation';
import { PostsService } from '../posts/posts.service';
import { AnswersService } from '../answers/answers.service';
import { CommentsService } from '../comments/comments.service';

@Injectable()
export class ModerationService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(PostsService) private readonly posts: PostsService,
    @Inject(AnswersService) private readonly answers: AnswersService,
    @Inject(CommentsService) private readonly comments: CommentsService,
  ) {}
  async report(req: SessionRequest, body: unknown) {
    const u = requireUser(req),
      input = parse(ReportInputSchema, body);
    if (input.targetType === 'POST') await this.posts.visiblePost(req, input.targetId);
    else if (input.targetType === 'ANSWER') await this.answers.visibleAnswer(req, input.targetId);
    else await this.comments.visibleComment(req, input.targetId);
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
    return this.db.report.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }
}
