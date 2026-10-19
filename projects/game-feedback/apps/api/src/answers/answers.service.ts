import { UnitOfWork } from '../database/unit-of-work';
import { AnswersRepository } from './answers.repository';
import { type AnswerBodyDto, type HelpfulDto } from './answer-input.dto';
import { ACTIVE_CONTENT } from '../common/content';
import { UserVisibilityService } from '../users/user-visibility.service';
import { authorSelect } from '../users/user.presenter';
import { PostsService } from '../posts/posts.service';
import { responseAnswer } from './answer.presenter';
import { Inject, Injectable } from '@nestjs/common';
import type { SessionRequest } from '../auth/session.types';
import { requireUser } from '../auth/session-access';
import { ApiError } from '../common/http/api-error';

@Injectable()
export class AnswersService {
  constructor(
    @Inject(AnswersRepository) private readonly repository: AnswersRepository,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
    @Inject(PostsService) private readonly posts: PostsService,
  ) {}
  async createAnswer(req: SessionRequest, postId: string, input: AnswerBodyDto) {
    const u = requireUser(req),
      p = await this.posts.visiblePost(req, postId);
    const a = await this.transactions.run(async (tx) => {
      const row = await this.repository.createAnswer(
        {
          data: { postId, authorId: u.id, body: input.body },
          include: { author: { select: authorSelect } },
        },
        tx,
      );
      if (p.authorId !== u.id)
        await this.repository.createNotification(
          {
            data: {
              actorId: u.id,
              userId: p.authorId,
              postId,
              answerId: row.id,
              type: 'ANSWER',
              message: `${u.nickname}님이 피드백을 남겼어요.`,
            },
          },
          tx,
        );
      return row;
    });
    return responseAnswer(a);
  }
  async visibleAnswer(req: SessionRequest, id: string) {
    const a = await this.repository.findFirstAnswer({
      where: { id, ...ACTIVE_CONTENT },
      include: { author: { select: authorSelect } },
    });
    if (!a) throw new ApiError(404, 'ANSWER_NOT_FOUND', '답변을 찾을 수 없습니다.');
    await this.posts.visiblePost(req, a.postId);
    if ((await this.visibility.excluded(req)).includes(a.authorId))
      throw new ApiError(404, 'ANSWER_NOT_FOUND', '답변을 찾을 수 없습니다.');
    return a;
  }
  async updateAnswer(req: SessionRequest, id: string, input: AnswerBodyDto) {
    const u = requireUser(req),
      a = await this.visibleAnswer(req, id);
    if (a.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '작성자만 수정할 수 있습니다.');
    return responseAnswer(
      await this.repository.updateAnswer({
        where: { id },
        data: { body: input.body, readAt: null, helpful: false },
        include: { author: { select: authorSelect } },
      }),
    );
  }
  async deleteAnswer(req: SessionRequest, id: string) {
    const u = requireUser(req),
      a = await this.visibleAnswer(req, id);
    if (a.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '작성자만 삭제할 수 있습니다.');
    await this.transactions.run([
      this.repository.updateAnswer({
        where: { id },
        data: { deletedAt: new Date(), body: '', helpful: false },
      }),
      this.repository.deleteManyNotification({ where: { answerId: id } }),
    ]);
    return { ok: true };
  }
  async helpful(req: SessionRequest, id: string, input: HelpfulDto) {
    const u = requireUser(req),
      a = await this.visibleAnswer(req, id),
      p = await this.posts.visiblePost(req, a.postId);
    if (p.authorId !== u.id || a.authorId === u.id)
      throw new ApiError(403, 'FORBIDDEN', '요청자만 다른 사용자의 답변에 도움됨을 표시할 수 있습니다.');
    const row = await this.transactions.run(async (tx) => {
      const changed = await this.repository.updateManyAnswer(
        {
          where: { id, helpful: !input.helpful },
          data: { helpful: input.helpful, readAt: new Date() },
        },
        tx,
      );
      if (input.helpful && changed.count)
        await this.repository.createNotification(
          {
            data: {
              actorId: u.id,
              userId: a.authorId,
              postId: a.postId,
              answerId: a.id,
              type: 'HELPFUL',
              message: `${u.nickname}님이 피드백을 도움됨으로 표시했어요.`,
            },
          },
          tx,
        );
      return this.repository.findUniqueOrThrowAnswer(
        { where: { id }, include: { author: { select: authorSelect } } },
        tx,
      );
    });
    return responseAnswer(row);
  }
}
