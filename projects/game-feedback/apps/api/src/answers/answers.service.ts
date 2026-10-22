import { Inject, Injectable } from '@nestjs/common';

import { postCacheTag } from '@game-feedback/contracts';

import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { CacheInvalidationService } from '../cache-invalidation/cache-invalidation.service';
import { ACTIVE_CONTENT, ACTIVE_POST } from '../common/content';
import { ApiError } from '../common/http/api-error';
import { PrismaClient, type Prisma } from '../generated/prisma';
import { PostsService } from '../posts/posts.service';
import { UserVisibilityService } from '../users/user-visibility.service';
import { authorSelect } from '../users/user.presenter';
import { type AnswerBodyDto, type HelpfulDto } from './answer-input.dto';
import { responseAnswer } from './answer.presenter';

@Injectable()
export class AnswersService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(CacheInvalidationService) private readonly cache: CacheInvalidationService,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
    @Inject(PostsService) private readonly posts: PostsService,
  ) {}
  async createAnswer(req: SessionRequest, postId: string, input: AnswerBodyDto) {
    const u = requireUser(req);
    const a = await this.cache.change(
      async (tx) => {
        // 잠금 뒤 다시 확인해 그 사이 숨김·삭제·차단된 글에 답변이 붙지 않게 한다.
        await tx.$queryRaw`SELECT "id" FROM "Post" WHERE "id" = ${postId} FOR UPDATE`;
        const excluded = await this.visibility.excluded(req, tx);
        const p = await tx.post.findFirst({
          where: { id: postId, ...ACTIVE_POST, authorId: { notIn: excluded } },
          select: { authorId: true },
        });
        if (!p) throw new ApiError(404, 'POST_NOT_FOUND', '게시글을 찾을 수 없습니다.');
        const row = await (tx ?? this.db).answer.create({
          data: { postId, authorId: u.id, body: input.body },
          include: { author: { select: authorSelect } },
        });
        if (p.authorId !== u.id)
          await (tx ?? this.db).notification.create({
            data: {
              actorId: u.id,
              userId: p.authorId,
              postId,
              answerId: row.id,
              type: 'ANSWER',
              message: `${u.nickname}님이 피드백을 남겼어요.`,
            },
          });
        return row;
      },
      (row) => [postCacheTag(row.postId)],
    );
    return responseAnswer(a);
  }
  async visibleAnswer(req: SessionRequest, id: string) {
    const a = await this.db.answer.findFirst({
      where: { id, ...ACTIVE_CONTENT },
      include: { author: { select: authorSelect } },
    });
    if (!a) throw new ApiError(404, 'ANSWER_NOT_FOUND', '답변을 찾을 수 없습니다.');
    await this.posts.visiblePost(req, a.postId);
    if ((await this.visibility.excluded(req)).includes(a.authorId))
      throw new ApiError(404, 'ANSWER_NOT_FOUND', '답변을 찾을 수 없습니다.');
    return a;
  }
  /** 글 → 답변 순서로 잠근 뒤 트랜잭션 안에서 가시성을 다시 확인한다(createComment와 같은 순서). */
  private async lockVisibleAnswer(
    req: SessionRequest,
    tx: Prisma.TransactionClient,
    answer: { id: string; postId: string },
  ) {
    await tx.$queryRaw`SELECT "id" FROM "Post" WHERE "id" = ${answer.postId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Answer" WHERE "id" = ${answer.id} FOR UPDATE`;
    const excluded = await this.visibility.excluded(req, tx);
    const visible = await tx.answer.findFirst({
      where: {
        id: answer.id,
        ...ACTIVE_CONTENT,
        authorId: { notIn: excluded },
        post: { ...ACTIVE_POST, authorId: { notIn: excluded } },
      },
      select: { id: true },
    });
    if (!visible) throw new ApiError(404, 'ANSWER_NOT_FOUND', '답변을 찾을 수 없습니다.');
  }
  async updateAnswer(req: SessionRequest, id: string, input: AnswerBodyDto) {
    const u = requireUser(req),
      a = await this.visibleAnswer(req, id);
    if (a.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '작성자만 수정할 수 있습니다.');
    return responseAnswer(
      await this.cache.change(
        async (tx) => {
          await this.lockVisibleAnswer(req, tx, a);
          // 수정하면 도움됨 표시가 풀리므로 그 알림도 남기지 않는다.
          await tx.notification.deleteMany({ where: { answerId: id, type: 'HELPFUL' } });
          return tx.answer.update({
            where: { id },
            data: { body: input.body, readAt: null, helpful: false },
            include: { author: { select: authorSelect } },
          });
        },
        [postCacheTag(a.postId)],
      ),
    );
  }
  async deleteAnswer(req: SessionRequest, id: string) {
    const u = requireUser(req);
    await this.cache.change(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Answer" WHERE "id" = ${id} FOR UPDATE`;
        // 작성자 삭제는 소유권만 본다. 관리자가 숨긴 자기 답변도 지울 수 있어야 한다.
        const own = await tx.answer.findFirst({
          where: { id, authorId: u.id, deletedAt: null },
          select: { postId: true },
        });
        if (!own) throw await this.deletionDenied(req, id, tx);
        await tx.answer.update({
          where: { id },
          data: { deletedAt: new Date(), body: '', helpful: false },
        });
        await tx.notification.deleteMany({ where: { answerId: id } });
        return own;
      },
      (own) => [postCacheTag(own.postId)],
    );
    return { ok: true };
  }
  /** 남의 답변이면 볼 수 있을 때만 403, 볼 수 없거나 이미 지운 답변은 404로 존재를 숨긴다. */
  private async deletionDenied(req: SessionRequest, id: string, tx: Prisma.TransactionClient) {
    const excluded = await this.visibility.excluded(req, tx);
    const visible = await tx.answer.findFirst({
      where: {
        id,
        ...ACTIVE_CONTENT,
        authorId: { notIn: excluded },
        post: { ...ACTIVE_POST, authorId: { notIn: excluded } },
      },
      select: { id: true },
    });
    return visible
      ? new ApiError(403, 'FORBIDDEN', '작성자만 삭제할 수 있습니다.')
      : new ApiError(404, 'ANSWER_NOT_FOUND', '답변을 찾을 수 없습니다.');
  }
  async helpful(req: SessionRequest, id: string, input: HelpfulDto) {
    const u = requireUser(req),
      a = await this.visibleAnswer(req, id),
      p = await this.posts.visiblePost(req, a.postId);
    if (p.authorId !== u.id || a.authorId === u.id)
      throw new ApiError(403, 'FORBIDDEN', '요청자만 다른 사용자의 답변에 도움됨을 표시할 수 있습니다.');
    const row = await this.cache.change(
      async (tx) => {
        await this.lockVisibleAnswer(req, tx, a);
        const changed = await (tx ?? this.db).answer.updateMany({
          where: { id, helpful: !input.helpful },
          data: { helpful: input.helpful, readAt: new Date() },
        });
        // 도움됨 알림은 답변마다 하나만 둔다. 해제하면 지우고, 다시 표시하면 이전 알림을 바꾼다.
        if (changed.count)
          await (tx ?? this.db).notification.deleteMany({ where: { answerId: a.id, type: 'HELPFUL' } });
        if (input.helpful && changed.count)
          await (tx ?? this.db).notification.create({
            data: {
              actorId: u.id,
              userId: a.authorId,
              postId: a.postId,
              answerId: a.id,
              type: 'HELPFUL',
              message: `${u.nickname}님이 피드백을 도움됨으로 표시했어요.`,
            },
          });
        return (tx ?? this.db).answer.findUniqueOrThrow({
          where: { id },
          include: { author: { select: authorSelect } },
        });
      },
      [postCacheTag(a.postId)],
    );
    return responseAnswer(row);
  }
}
