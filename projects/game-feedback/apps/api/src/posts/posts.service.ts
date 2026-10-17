import {
  ListQuerySchema,
  PostInputSchema,
  PostPatchSchema,
  type GameProfile,
  richTextToPlainText,
} from '@game-feedback/contracts';
import { ACTIVE_CONTENT, ACTIVE_POST } from '../common/content';
import { decodeCursor, encodeCursor } from '../common/pagination';
import { UserVisibilityService } from '../users/user-visibility.service';
import { authorSelect } from '../users/user.presenter';
import { GameProfilesService } from '../game-profiles/game-profiles.service';
import { postInclude, responsePost } from './post.presenter';
import { responseAnswer } from '../answers/answer.presenter';
import { responseComment } from '../comments/comment.presenter';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, Prisma } from '../generated/prisma';
import type { SessionRequest } from '../auth/session.types';
import { requireUser } from '../auth/session-access';
import { parse } from '../common/validation';
import { ApiError } from '../common/http/api-error';

@Injectable()
export class PostsService {
  constructor(
    @Inject(PrismaClient) readonly db: PrismaClient,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
    @Inject(GameProfilesService) private readonly profiles: GameProfilesService,
  ) {}
  async visiblePost(req: SessionRequest, id: string) {
    const excluded = await this.visibility.excluded(req);
    const post = await this.db.post.findFirst({
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
  async listPosts(req: SessionRequest) {
    const q = parse(ListQuerySchema, req.query),
      cursor = decodeCursor(q.cursor),
      excluded = await this.visibility.excluded(req);
    const where: Prisma.PostWhereInput = {
      ...ACTIVE_POST,
      ...(q.board === 'ALL' || (!q.board && q.authorId) ? {} : { board: q.board ?? 'FEEDBACK' }),
      authorId: { notIn: excluded, ...(q.authorId ? { equals: q.authorId } : {}) },
      ...(q.category ? { category: { slug: q.category } } : {}),
      ...(q.unanswered === 'true'
        ? { answers: { none: { ...ACTIVE_CONTENT, authorId: { notIn: excluded } } } }
        : {}),
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
    const rows = await this.db.post.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      include: {
        ...postInclude,
        answers: {
          where: { ...ACTIVE_CONTENT, authorId: { notIn: excluded } },
          select: { id: true, helpful: true },
        },
      },
    });
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
      this.db.answer.findMany({
        where: { postId: id, ...ACTIVE_CONTENT, authorId: { notIn: excluded } },
        include: { author: { select: authorSelect } },
        orderBy: [{ helpful: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.db.comment.findMany({
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
  async createPost(req: SessionRequest, body: unknown) {
    const u = requireUser(req),
      input = parse(PostInputSchema, body);
    if (input.document && richTextToPlainText(input.document) !== input.body)
      throw new ApiError(400, 'INVALID_DOCUMENT', '본문과 편집 내용을 확인해주세요.');
    if ((input.board === 'COACHING') !== !!input.coaching)
      throw new ApiError(400, 'INVALID_COACHING', '코칭 글의 모집 유형과 수강료를 확인해주세요.');
    if ((input.board === 'FRIEND_SALE') !== !!input.friendSale)
      throw new ApiError(400, 'INVALID_FRIEND_SALE', '친추판매 글의 판매 금액을 확인해주세요.');
    const category = await this.db.category.findFirst({ where: { id: input.categoryId, active: true } });
    if (!category) throw new ApiError(400, 'INVALID_CATEGORY', '카테고리를 확인해주세요.');
    if (input.playerTag && category.slug !== 'clash-royale')
      throw new ApiError(400, 'INVALID_PROFILE_GAME', '선택한 게임의 프로필을 확인해주세요.');
    let profile: GameProfile | undefined;
    if (input.playerTag) profile = await this.profiles.lookup(input.playerTag);
    const p = await this.db.post.create({
      data: {
        authorId: u.id,
        categoryId: category.id,
        title: input.title,
        body: input.body,
        board: input.board ?? 'FEEDBACK',
        ...(input.document ? { document: input.document } : {}),
        ...(input.coaching ? { coaching: input.coaching } : {}),
        ...(input.friendSale ? { friendSale: input.friendSale } : {}),
        ...(profile ? { gameProfile: profile as unknown as Prisma.InputJsonValue } : {}),
      },
      include: postInclude,
    });
    return responsePost(p);
  }
  async updatePost(req: SessionRequest, id: string, body: unknown) {
    const u = requireUser(req),
      input = parse(PostPatchSchema, body),
      p = await this.visiblePost(req, id);
    if (p.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '작성자만 수정할 수 있습니다.');
    const { playerTag, document, coaching, friendSale, ...data } = input;
    if (coaching !== undefined && (p.board === 'COACHING') !== !!coaching)
      throw new ApiError(400, 'INVALID_COACHING', '코칭 글의 모집 유형과 수강료를 확인해주세요.');
    if (friendSale !== undefined && (p.board === 'FRIEND_SALE') !== !!friendSale)
      throw new ApiError(400, 'INVALID_FRIEND_SALE', '친추판매 글의 판매 금액을 확인해주세요.');
    if (playerTag && p.category.slug !== 'clash-royale')
      throw new ApiError(400, 'INVALID_PROFILE_GAME', '선택한 게임의 프로필을 확인해주세요.');
    if (input.document && (!input.body || richTextToPlainText(input.document) !== input.body))
      throw new ApiError(400, 'INVALID_DOCUMENT', '본문과 편집 내용을 확인해주세요.');
    const excluded = await this.visibility.excluded(req);
    const gameProfile = playerTag ? await this.profiles.lookup(playerTag) : undefined;
    return responsePost(
      await this.db.post.update({
        where: { id },
        data: {
          ...data,
          ...(coaching !== undefined ? { coaching: coaching ?? Prisma.DbNull } : {}),
          ...(friendSale !== undefined ? { friendSale: friendSale ?? Prisma.DbNull } : {}),
          ...(input.body !== undefined || document === null ? { document: document ?? Prisma.DbNull } : {}),
          ...(gameProfile ? { gameProfile: gameProfile as unknown as Prisma.InputJsonValue } : {}),
        },
        include: {
          ...postInclude,
          answers: {
            where: { ...ACTIVE_CONTENT, authorId: { notIn: excluded } },
            select: { id: true, helpful: true },
          },
        },
      }),
    );
  }
  async deletePost(req: SessionRequest, id: string) {
    const u = requireUser(req),
      p = await this.visiblePost(req, id);
    if (p.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '작성자만 삭제할 수 있습니다.');
    await this.db.$transaction([
      this.db.post.update({
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
      this.db.notification.deleteMany({ where: { postId: id } }),
    ]);
    return { ok: true };
  }
  async readPost(req: SessionRequest, id: string) {
    const u = requireUser(req),
      p = await this.visiblePost(req, id);
    if (p.authorId !== u.id) throw new ApiError(403, 'FORBIDDEN', '요청자만 답변을 확인할 수 있습니다.');
    await this.db.$transaction([
      this.db.answer.updateMany({
        where: { postId: id, readAt: null, ...ACTIVE_CONTENT },
        data: { readAt: new Date() },
      }),
      this.db.notification.updateMany({
        where: { userId: u.id, postId: id, readAt: null },
        data: { readAt: new Date() },
      }),
    ]);
    return { ok: true };
  }
}
