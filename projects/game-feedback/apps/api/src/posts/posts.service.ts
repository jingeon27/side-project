import { UnitOfWork } from '../database/unit-of-work';
import { PostsRepository } from './posts.repository';
import type { ListQueryDto } from '../common/http/list-query.dto';
import { type UpdatePostDto, type CreatePostDto } from './post-input.dto';
import { richTextToPlainText } from '@game-feedback/contracts';
import { ACTIVE_CONTENT, ACTIVE_POST } from '../common/content';
import { encodeCursor } from '../common/pagination';
import { UserVisibilityService } from '../users/user-visibility.service';
import { authorSelect } from '../users/user.presenter';
import { PostMediaService } from './post-media.service';
import { postInclude, responsePost } from './post.presenter';
import { responseAnswer } from '../answers/answer.presenter';
import { responseComment } from '../comments/comment.presenter';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import type { SessionRequest } from '../auth/session.types';
import { requireUser } from '../auth/session-access';
import { ApiError } from '../common/http/api-error';

@Injectable()
export class PostsService {
  constructor(
    @Inject(PostsRepository) private readonly repository: PostsRepository,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
    @Inject(PostMediaService) private readonly media: PostMediaService,
  ) {}
  async visiblePost(req: SessionRequest, id: string) {
    const excluded = await this.visibility.excluded(req);
    const post = await this.repository.findFirstPost({
      where: { id, ...ACTIVE_POST, authorId: { notIn: excluded } },
      include: {
        ...postInclude,
        answers: {
          where: { ...ACTIVE_CONTENT, authorId: { notIn: excluded } },
          select: { id: true, helpful: true },
        },
      },
    });
    if (!post) throw new ApiError(404, 'POST_NOT_FOUND', '게시글을 찾을 수 없습니다.');
    return post;
  }
  async listPosts(req: SessionRequest, query: ListQueryDto) {
    const q = query,
      excluded = await this.visibility.excluded(req);
    if (q.battleMode && q.board !== 'FRIENDLY')
      throw new ApiError(400, 'INVALID_BATTLE_FILTER', '전투 모집에서 전투 유형을 선택해주세요.');
    if (q.coachingRole && q.board !== 'COACHING')
      throw new ApiError(400, 'INVALID_COACHING_FILTER', '게임코치에서 모집 유형을 선택해주세요.');
    if (
      q.feedbackStatus &&
      (q.board !== 'FEEDBACK' || (q.feedbackStatus === 'ANSWERED' && q.unanswered === 'true'))
    )
      throw new ApiError(400, 'INVALID_FEEDBACK_FILTER', '피드백의 답변 상태를 확인해주세요.');
    const rows = await this.repository.listVisiblePosts(q, excluded);
    const more = rows.length > q.limit,
      items = rows.slice(0, q.limit);
    return {
      items: items.map(responsePost),
      nextCursor: more ? encodeCursor(items[items.length - 1]) : null,
    };
  }
  async detail(req: SessionRequest, id: string) {
    const p = await this.visiblePost(req, id),
      excluded = await this.visibility.excluded(req);
    const [answers, comments] = await Promise.all([
      this.repository.findManyAnswer({
        where: { postId: id, ...ACTIVE_CONTENT, authorId: { notIn: excluded } },
        include: { author: { select: authorSelect } },
        orderBy: [{ helpful: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.repository.findManyComment({
        where: { postId: id, ...ACTIVE_CONTENT, authorId: { notIn: excluded } },
        include: { author: { select: authorSelect } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return {
      post: responsePost({ ...p, answers }),
      answers: answers.map(responseAnswer),
      comments: comments.map(responseComment),
    };
  }
  async createPost(req: SessionRequest, input: CreatePostDto) {
    const u = requireUser(req);
    if (input.document && richTextToPlainText(input.document) !== input.body)
      throw new ApiError(400, 'INVALID_DOCUMENT', '본문과 편집 내용을 확인해주세요.');
    if ((input.board === 'COACHING') !== !!input.coaching)
      throw new ApiError(400, 'INVALID_COACHING', '코칭 글의 모집 유형과 수강료를 확인해주세요.');
    if ((input.board === 'FRIEND_SALE') !== !!input.friendSale)
      throw new ApiError(400, 'INVALID_FRIEND_SALE', '친추판매 글의 판매 금액을 확인해주세요.');
    if ((input.board === 'FRIENDLY') !== !!input.battle)
      throw new ApiError(400, 'INVALID_BATTLE', '전투 모집의 전투 유형을 선택해주세요.');
    const category = await this.repository.findFirstCategory({
      where: { id: input.categoryId, active: true },
    });
    if (!category) throw new ApiError(400, 'INVALID_CATEGORY', '카테고리를 확인해주세요.');
    const p = await this.transactions.run(async (tx) => {
      const created = await this.repository.createPost(
        {
          data: {
            authorId: u.id,
            categoryId: category.id,
            title: input.title,
            body: input.body,
            board: input.board ?? 'FEEDBACK',
            ...(input.document ? { document: input.document } : {}),
            ...(input.coaching ? { coaching: input.coaching } : {}),
            ...(input.friendSale ? { friendSale: input.friendSale } : {}),
            ...(input.battle ? { battle: input.battle } : {}),
          },
          include: postInclude,
        },
        tx,
      );
      await this.media.sync(tx, u.id, created.id, input.document);
      // Serialize delivery with notification preference changes and block cleanup.
      const subscriptions = await this.repository.lockSubscribedFollowers(u.id, tx);
      const excluded = await this.visibility.excluded(req, tx);
      const followers = await this.repository.findManyUserFollow(
        {
          where: {
            followingId: u.id,
            notifyNewPosts: true,
            followerId: { in: subscriptions.map(({ followerId }) => followerId), notIn: excluded },
            follower: { bannedAt: null },
          },
          select: { followerId: true },
        },
        tx,
      );
      if (followers.length)
        await this.repository.createManyNotification(
          {
            data: followers.map(({ followerId }) => ({
              userId: followerId,
              actorId: u.id,
              postId: created.id,
              type: 'FOLLOWED_POST',
              message: `${u.nickname}: ${created.title}`,
            })),
          },
          tx,
        );
      return created;
    });
    return responsePost(p);
  }
  async updatePost(req: SessionRequest, id: string, input: UpdatePostDto) {
    const u = requireUser(req),
      p = await this.visiblePost(req, id);
    if (p.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '작성자만 수정할 수 있습니다.');
    const { document, coaching, friendSale, battle, ...data } = input;
    if (coaching !== undefined && (p.board === 'COACHING') !== !!coaching)
      throw new ApiError(400, 'INVALID_COACHING', '코칭 글의 모집 유형과 수강료를 확인해주세요.');
    if (friendSale !== undefined && (p.board === 'FRIEND_SALE') !== !!friendSale)
      throw new ApiError(400, 'INVALID_FRIEND_SALE', '친추판매 글의 판매 금액을 확인해주세요.');
    if (battle !== undefined && (p.board === 'FRIENDLY') !== !!battle)
      throw new ApiError(400, 'INVALID_BATTLE', '전투 모집의 전투 유형을 선택해주세요.');
    if (input.document && (!input.body || richTextToPlainText(input.document) !== input.body))
      throw new ApiError(400, 'INVALID_DOCUMENT', '본문과 편집 내용을 확인해주세요.');
    const excluded = await this.visibility.excluded(req);
    return responsePost(
      await this.transactions.run(async (tx) => {
        await this.repository.lockPost(id, tx);
        if (input.body !== undefined || document !== undefined) await this.media.sync(tx, u.id, id, document);
        return this.repository.updatePost(
          {
            where: { id },
            data: {
              ...data,
              ...(coaching !== undefined ? { coaching: coaching ?? Prisma.DbNull } : {}),
              ...(friendSale !== undefined ? { friendSale: friendSale ?? Prisma.DbNull } : {}),
              ...(battle !== undefined ? { battle: battle ?? Prisma.DbNull } : {}),
              ...(input.body !== undefined || document === null
                ? { document: document ?? Prisma.DbNull }
                : {}),
            },
            include: {
              ...postInclude,
              answers: {
                where: { ...ACTIVE_CONTENT, authorId: { notIn: excluded } },
                select: { id: true, helpful: true },
              },
            },
          },
          tx,
        );
      }),
    );
  }
  async deletePost(req: SessionRequest, id: string) {
    const u = requireUser(req),
      p = await this.visiblePost(req, id);
    if (p.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '작성자만 삭제할 수 있습니다.');
    await this.transactions.run([
      this.repository.updatePost({
        where: { id },
        data: {
          deletedAt: new Date(),
          title: '삭제된 요청',
          body: '',
          gameProfile: Prisma.DbNull,
          document: Prisma.DbNull,
          coaching: Prisma.DbNull,
          friendSale: Prisma.DbNull,
        },
      }),
      this.repository.deleteManyNotification({ where: { postId: id } }),
      this.repository.deleteManyPostMedia({ where: { postId: id } }),
    ]);
    return { ok: true };
  }
  async readPost(req: SessionRequest, id: string) {
    const u = requireUser(req),
      p = await this.visiblePost(req, id);
    if (p.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '요청자만 답변을 확인할 수 있습니다.');
    await this.transactions.run([
      this.repository.updateManyAnswer({
        where: { postId: id, readAt: null, ...ACTIVE_CONTENT },
        data: { readAt: new Date() },
      }),
      this.repository.updateManyNotification({
        where: { userId: u.id, postId: id, readAt: null },
        data: { readAt: new Date() },
      }),
    ]);
    return { ok: true };
  }
}
