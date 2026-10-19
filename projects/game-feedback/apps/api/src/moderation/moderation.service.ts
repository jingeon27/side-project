import { ModerationRepository } from './moderation.repository';
import type { CreateReportDto } from './report-input.dto';
import { Inject, Injectable } from '@nestjs/common';
import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { PostsService } from '../posts/posts.service';
import { AnswersService } from '../answers/answers.service';
import { CommentsService } from '../comments/comments.service';
import { ApiError } from '../common/http/api-error';

@Injectable()
export class ModerationService {
  constructor(
    @Inject(ModerationRepository) private readonly repository: ModerationRepository,
    @Inject(PostsService) private readonly posts: PostsService,
    @Inject(AnswersService) private readonly answers: AnswersService,
    @Inject(CommentsService) private readonly comments: CommentsService,
  ) {}
  async report(req: SessionRequest, input: CreateReportDto) {
    const u = requireUser(req);
    if (input.targetType === 'POST') await this.posts.visiblePost(req, input.targetId);
    if (input.targetType === 'ANSWER') await this.answers.visibleAnswer(req, input.targetId);
    if (input.targetType === 'COMMENT') await this.comments.visibleComment(req, input.targetId);
    if (input.targetType === 'USER') {
      if (input.targetId === u.id)
        throw new ApiError(400, 'CANNOT_REPORT_SELF', '자신을 신고할 수 없습니다.');
      if (!(await this.repository.findUniqueUser({ where: { id: input.targetId } })))
        throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
    }
    await this.repository.upsertReport({
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
