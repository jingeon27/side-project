import { PrismaClient } from '../generated/prisma';

import { Inject, Injectable } from '@nestjs/common';
import { match } from 'ts-pattern';
import { AnswersService } from '../answers/answers.service';
import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { CommentsService } from '../comments/comments.service';
import { ApiError } from '../common/http/api-error';
import { PostsService } from '../posts/posts.service';
import type { CreateReportDto } from './report-input.dto';

@Injectable()
export class ModerationService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(PostsService) private readonly posts: PostsService,
    @Inject(AnswersService) private readonly answers: AnswersService,
    @Inject(CommentsService) private readonly comments: CommentsService,
  ) {}
  async report(req: SessionRequest, input: CreateReportDto) {
    const u = requireUser(req);
    await match(input.targetType)
      .with('POST', () => this.posts.visiblePost(req, input.targetId))
      .with('ANSWER', () => this.answers.visibleAnswer(req, input.targetId))
      .with('COMMENT', () => this.comments.visibleComment(req, input.targetId))
      .with('USER', async () => {
        if (input.targetId === u.id)
          throw new ApiError(400, 'CANNOT_REPORT_SELF', '자신을 신고할 수 없습니다.');
        if (!(await this.db.user.findUnique({ where: { id: input.targetId } })))
          throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
      })
      .exhaustive();
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
}
