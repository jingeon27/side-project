import { Inject, Injectable } from '@nestjs/common';

import { DISCOVERY_CACHE_TAG, postCacheTag, richTextToPlainText } from '@game-feedback/contracts';

import { ANSWER_PAGE, answerPage } from '../answers/answer-page';
import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { CacheInvalidationService } from '../cache-invalidation/cache-invalidation.service';
import { COMMENT_THREAD_PAGE, commentThreadPage } from '../comments/comment-page';
import { ACTIVE_CONTENT, ACTIVE_POST } from '../common/content';
import { ApiError } from '../common/http/api-error';
import { type TListQueryDto } from '../common/http/list-query.dto';
import { decodeCursor, nextCursor } from '../common/pagination';
import { Prisma, PrismaClient } from '../generated/prisma';
import { writePostNotifications } from '../push/post-notification.writer';
import { UserVisibilityService } from '../users/user-visibility.service';
import { answerCounts, NO_ANSWERS } from './post-answer-counts';
import { type TCreatePostDto, type TUpdatePostDto } from './post-input.dto';
import { PostMediaService } from './post-media.service';
import { postInclude, responsePost } from './post.presenter';

@Injectable()
export class PostsService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(CacheInvalidationService) private readonly cache: CacheInvalidationService,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
    @Inject(PostMediaService) private readonly media: PostMediaService,
  ) {}
  async visiblePost(req: SessionRequest, id: string) {
    const excluded = await this.visibility.excluded(req);
    const post = await this.db.post.findFirst({
      where: { id, ...ACTIVE_POST, authorId: { notIn: excluded } },
      include: postInclude,
    });
    if (!post) throw new ApiError(404, 'POST_NOT_FOUND', '게시글을 찾을 수 없습니다.');
    return post;
  }
  async listPosts(req: SessionRequest, query: TListQueryDto) {
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
    const rows = await this.listVisiblePosts(q, excluded);
    const page = rows.slice(0, q.limit);
    const counts = await answerCounts(
      this.db,
      page.map((post) => post.id),
      excluded,
    );
    return {
      items: page.map((post) => responsePost(post, counts.get(post.id))),
      nextCursor: nextCursor(rows, q.limit),
    };
  }
  async detail(req: SessionRequest, id: string) {
    const p = await this.visiblePost(req, id),
      excluded = await this.visibility.excluded(req);
    const [answers, counts, comments] = await Promise.all([
      answerPage(this.db, id, excluded, { limit: ANSWER_PAGE }),
      answerCounts(this.db, [id], excluded),
      commentThreadPage(this.db, id, excluded, { limit: COMMENT_THREAD_PAGE }),
    ]);
    return {
      post: responsePost(p, counts.get(id)),
      answers: answers.items,
      answersCursor: answers.nextCursor,
      comments: comments.items,
      commentsCursor: comments.nextCursor,
    };
  }
  async createPost(req: SessionRequest, input: TCreatePostDto) {
    const u = requireUser(req);
    if (input.document && richTextToPlainText(input.document) !== input.body)
      throw new ApiError(400, 'INVALID_DOCUMENT', '본문과 편집 내용을 확인해주세요.');
    if ((input.board === 'COACHING') !== !!input.coaching)
      throw new ApiError(400, 'INVALID_COACHING', '코칭 글의 모집 유형과 수강료를 확인해주세요.');
    if ((input.board === 'FRIEND_SALE') !== !!input.friendSale)
      throw new ApiError(400, 'INVALID_FRIEND_SALE', '친추판매 글의 판매 금액을 확인해주세요.');
    if ((input.board === 'FRIENDLY') !== !!input.battle)
      throw new ApiError(400, 'INVALID_BATTLE', '전투 모집의 전투 유형을 선택해주세요.');
    const category = await this.db.category.findFirst({
      where: { id: input.categoryId, active: true },
    });
    if (!category) throw new ApiError(400, 'INVALID_CATEGORY', '카테고리를 확인해주세요.');
    const p = await this.cache.change(
      async (tx) => {
        const created = await (tx ?? this.db).post.create({
          data: {
            authorId: u.id,
            categoryId: category.id,
            title: input.title,
            body: input.body,
            board: input.board ?? 'FEEDBACK',
            ...(input.document
              ? {
                  document: input.document,
                }
              : {}),
            ...(input.coaching ? { coaching: input.coaching } : {}),
            ...(input.friendSale ? { friendSale: input.friendSale } : {}),
            ...(input.battle ? { battle: input.battle } : {}),
          },
          include: postInclude,
        });
        await this.media.sync(tx, u.id, created.id, input.document);
        // Serialize delivery with notification preference changes and block cleanup.
        const subscriptions = await tx.$queryRaw<
          Array<{
            followerId: string;
          }>
        >`SELECT "followerId" FROM "UserFollow" WHERE "followingId" = ${u.id} AND "notifyNewPosts" = true ORDER BY "followerId" FOR UPDATE`;
        const excluded = await this.visibility.excluded(req, tx);
        const followers = await (tx ?? this.db).userFollow.findMany({
          where: {
            followingId: u.id,
            notifyNewPosts: true,
            followerId: { in: subscriptions.map(({ followerId }) => followerId), notIn: excluded },
            follower: { bannedAt: null },
          },
          select: { followerId: true },
        });
        if (followers.length)
          await writePostNotifications(
            tx,
            followers.map(({ followerId }) => ({
              userId: followerId,
              actorId: u.id,
              postId: created.id,
              type: 'FOLLOWED_POST',
            })),
          );
        return created;
      },
      (created) => [postCacheTag(created.id), DISCOVERY_CACHE_TAG],
    );
    return responsePost(p, NO_ANSWERS);
  }
  async updatePost(req: SessionRequest, id: string, input: TUpdatePostDto) {
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
    const updated = await this.cache.change(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Post" WHERE "id" = ${id} FOR UPDATE`;
        // 잠금 뒤 다시 확인해 그 사이 숨김·삭제된 글을 고치지 않게 한다.
        const current = await tx.post.findFirst({
          where: { id, ...ACTIVE_POST, authorId: u.id },
          select: { id: true },
        });
        if (!current) throw new ApiError(404, 'POST_NOT_FOUND', '게시글을 찾을 수 없습니다.');
        if (input.body !== undefined || document !== undefined) await this.media.sync(tx, u.id, id, document);
        const post = await (tx ?? this.db).post.update({
          where: { id },
          data: {
            ...data,
            ...(coaching !== undefined ? { coaching: coaching ?? Prisma.DbNull } : {}),
            ...(friendSale !== undefined ? { friendSale: friendSale ?? Prisma.DbNull } : {}),
            ...(battle !== undefined ? { battle: battle ?? Prisma.DbNull } : {}),
            ...(input.body !== undefined || document === null ? { document: document ?? Prisma.DbNull } : {}),
          },
          include: postInclude,
        });
        return { post, counts: await answerCounts(tx, [id], excluded) };
      },
      [postCacheTag(id), DISCOVERY_CACHE_TAG],
    );
    return responsePost(updated.post, updated.counts.get(id));
  }
  async deletePost(req: SessionRequest, id: string) {
    const u = requireUser(req);
    await this.cache.change(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Post" WHERE "id" = ${id} FOR UPDATE`;
        // 작성자 삭제는 소유권만 본다. 관리자가 숨긴 자기 글도 지울 수 있어야 한다.
        const own = await tx.post.findFirst({
          where: { id, authorId: u.id, deletedAt: null },
          select: { id: true },
        });
        if (!own) throw await this.deletionDenied(req, id, tx);
        await tx.post.update({
          where: { id },
          data: {
            deletedAt: new Date(),
            title: '\uC0AD\uC81C\uB41C \uC694\uCCAD',
            body: '',
            gameProfile: Prisma.DbNull,
            document: Prisma.DbNull,
            coaching: Prisma.DbNull,
            friendSale: Prisma.DbNull,
            battle: Prisma.DbNull,
          },
        });
        await tx.notification.deleteMany({ where: { postId: id } });
        await tx.postMedia.deleteMany({ where: { postId: id } });
      },
      () => [postCacheTag(id), DISCOVERY_CACHE_TAG],
    );
    return { ok: true };
  }
  /** 남의 글이면 볼 수 있을 때만 403, 볼 수 없거나 이미 지운 글은 404로 존재를 숨긴다. */
  private async deletionDenied(req: SessionRequest, id: string, tx: Prisma.TransactionClient) {
    const excluded = await this.visibility.excluded(req, tx);
    const visible = await tx.post.findFirst({
      where: { id, ...ACTIVE_POST, authorId: { notIn: excluded } },
      select: { id: true },
    });
    return visible
      ? new ApiError(403, 'FORBIDDEN', '작성자만 삭제할 수 있습니다.')
      : new ApiError(404, 'POST_NOT_FOUND', '게시글을 찾을 수 없습니다.');
  }
  async readPost(req: SessionRequest, id: string) {
    const u = requireUser(req),
      p = await this.visiblePost(req, id);
    if (p.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '요청자만 답변을 확인할 수 있습니다.');
    await this.cache.change(
      async (tx) => {
        const changed = await tx.answer.updateMany({
          where: { postId: id, readAt: null, ...ACTIVE_CONTENT },
          data: { readAt: new Date() },
        });
        await tx.notification.updateMany({
          where: { userId: u.id, postId: id, readAt: null },
          data: { readAt: new Date() },
        });
        return changed.count;
      },
      (count) => (count ? [postCacheTag(id)] : []),
    );
    return { ok: true };
  }

  private listVisiblePosts(q: TListQueryDto, excluded: string[]) {
    const cursor = decodeCursor(q.cursor);
    const visibleAnswers = { ...ACTIVE_CONTENT, authorId: { notIn: excluded } };
    const answerFilter =
      q.feedbackStatus === 'ANSWERED'
        ? { some: visibleAnswers }
        : q.feedbackStatus === 'WAITING' || q.unanswered === 'true'
          ? { none: visibleAnswers }
          : undefined;
    const where: Prisma.PostWhereInput = {
      ...ACTIVE_POST,
      ...(q.board === 'ALL' || (!q.board && q.authorId) ? {} : { board: q.board ?? 'FEEDBACK' }),
      authorId: { notIn: excluded, ...(q.authorId ? { equals: q.authorId } : {}) },
      ...(q.category ? { category: { slug: q.category } } : {}),
      ...(q.battleMode ? { battle: { path: ['mode'], equals: q.battleMode } } : {}),
      ...(q.coachingRole ? { coaching: { path: ['role'], equals: q.coachingRole } } : {}),
      ...(answerFilter ? { answers: answerFilter } : {}),
      ...(q.q
        ? {
            OR: [
              { title: { contains: q.q, mode: 'insensitive' } },
              { body: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    if (cursor)
      where.AND = [
        {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        },
      ];
    return this.db.post.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      include: postInclude,
    });
  }
}
