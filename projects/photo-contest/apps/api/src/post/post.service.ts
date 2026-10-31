import { Injectable } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { z } from 'zod';

import { Prisma } from '../../generated/prisma';
import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import { recordEvent } from '../analytics/analytics-event.writer';
import type { IViewer } from '../auth/session/session.service';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import { pageRange, textValue } from '../common/validation';
import { PAGE_SIZE_DEFAULT, POST_BODY_LIMIT, POST_TITLE_LIMIT } from '../config/limits';
import { assertContestParticipation } from '../contest/group-contest/group-contest.policy';
import { Database, type TDatabaseClient } from '../database/database.service';
import { UnitOfWork } from '../database/unit-of-work';
import { GroupCategoryService } from '../group/categories/group-category.service';
import { MembershipService } from '../group/membership/membership.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { PostFileService } from './media/post-file.service';
import { postLink } from './post-link.policy';
import { koreanMonth } from './post-order';
import { presentPost } from './post.presenter';
import { postInclude } from './post.query';

interface IPostInput {
  clientRequestId?: string | null;
  categoryId?: string | null;
  groupId: string;
  uploadId?: string | null;
  linkUrl?: string | null;
  contestId?: string | null;
  title: string;
  body?: string | null;
  rightsConfirmed: boolean;
}
interface IPostQuery {
  categoryId?: string | null;
  groupId?: string | null;
  contestId?: string | null;
  sort?: 'NEWEST' | 'MONTHLY_POPULAR' | null;
  offset?: number | null;
  limit?: number | null;
}
@Injectable()
export class PostService {
  constructor(
    private readonly db: Database,
    private readonly categories: GroupCategoryService,
    private readonly transactions: UnitOfWork,
    private readonly membership: MembershipService,
    private readonly files: PostFileService,
    private readonly limits: RateLimitService,
  ) {}

  async list(viewer: IViewer | null, query: IPostQuery) {
    if (!query.groupId && !viewer) fail(ERROR_MESSAGE.LOGIN_REQUIRED, ERROR_CODE.UNAUTHENTICATED);
    const groupIds = query.groupId
      ? [(await this.membership.readableGroup(viewer?.id ?? null, query.groupId)).group.id]
      : await this.membership.memberGroupIds(viewer?.id ?? '');
    return this.findPosts(viewer, { groupId: { in: groupIds } }, query);
  }

  async listPublic(viewer: IViewer | null, query: IPostQuery) {
    return this.findPosts(viewer, { group: { visibility: 'PUBLIC' } }, query);
  }

  async listMine(viewer: IViewer, query: Pick<IPostQuery, 'groupId' | 'offset' | 'limit'>) {
    if (query.groupId) await this.membership.readableGroup(viewer.id, query.groupId);
    return this.findPosts(
      viewer,
      {
        authorId: viewer.id,
        ...(query.groupId ? { groupId: query.groupId } : {}),
        group: {
          OR: [{ visibility: 'PUBLIC' }, { members: { some: { userId: viewer.id } } }],
        },
      },
      query,
    );
  }

  async find(viewer: IViewer | null, id: string) {
    await this.membership.readablePost(viewer?.id ?? null, id);
    const post = await this.db.post.findUniqueOrThrow({
      where: { id },
      include: postInclude(viewer?.id ?? null),
    });
    return presentPost(post, viewer?.id ?? null);
  }

  private async findPosts(viewer: IViewer | null, scope: Prisma.PostWhereInput, query: IPostQuery) {
    const { offset, limit } = pageRange(query.offset ?? 0, query.limit ?? PAGE_SIZE_DEFAULT);
    const popular = query.sort === 'MONTHLY_POPULAR';
    const rows = await this.db.post.findMany({
      where: {
        ...scope,
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.contestId ? { contestId: query.contestId } : {}),
        hidden: false,
        OR: [{ legacySubmissionId: null }, { legacySubmission: { hidden: false } }],
        ...(popular ? { createdAt: koreanMonth() } : {}),
      },
      include: postInclude(viewer?.id ?? null),
      skip: offset,
      take: limit,
      orderBy: [
        ...(popular ? [{ likes: { _count: 'desc' as const } }] : []),
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    });
    return rows.map((row) => presentPost(row, viewer?.id ?? null));
  }
  async create(viewer: IViewer, input: IPostInput, address: string | null = null) {
    if (!input.rightsConfirmed) fail('공유할 권리와 촬영된 사람의 동의를 확인해 주세요.');
    const title = textValue(input.title, POST_TITLE_LIMIT, '제목');
    const body = input.body?.trim() ?? '';
    if (body.length > POST_BODY_LIMIT) fail('내용은 5000자 이하로 입력해 주세요.');
    const linkUrl = postLink(input.linkUrl);
    const requestId = z.uuid().nullish().safeParse(input.clientRequestId);
    if (!requestId.success) fail('게시 요청 식별자를 확인해 주세요.');
    if (!input.uploadId && !linkUrl) fail('사진이나 동영상, 링크를 하나 이상 첨부해 주세요.');
    await this.limits.consume('POST_CREATE', { userId: viewer.id, address });
    const row = await this.transactions
      .atomic(async (tx) => {
        await this.membership.requireMember(viewer.id, input.groupId, tx);
        const existing = await this.existingPost(viewer, input, tx);
        if (existing) return existing;
        const upload = await this.files.requireCompletedUpload(viewer, input.groupId, input.uploadId, tx);
        if (input.contestId) {
          const contest = await tx.contest.findUnique({ where: { id: input.contestId } });
          if (!contest) fail('대회를 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
          assertContestParticipation(contest, input.groupId);
        }
        if (input.categoryId) await this.categories.requireActive(input.groupId, input.categoryId, tx);
        const created = await tx.post.create({
          data: {
            groupId: input.groupId,
            categoryId: input.categoryId ?? null,
            authorId: viewer.id,
            clientRequestId: requestId.data ?? null,
            uploadId: upload?.id ?? null,
            linkUrl,
            title,
            body,
            contestId: input.contestId ?? null,
          },
          include: postInclude(viewer.id),
        });
        if (upload) await this.files.retainUpload(upload.id, tx);
        await recordEvent(tx, {
          id: `post:${created.id}`,
          type: ANALYTICS_EVENT.POST_CREATED,
          userId: viewer.id,
          properties: {
            groupId: input.groupId,
            postId: created.id,
            kind: upload?.kind ?? 'LINK',
            categoryId: input.categoryId ?? null,
          },
        });
        return created;
      })
      .catch(async (error: unknown) => {
        const conflict = error instanceof GraphQLError && error.extensions.code === ERROR_CODE.CONFLICT;
        const existing = conflict ? await this.existingPost(viewer, input, this.db) : null;
        if (!existing) throw error;
        return existing;
      });
    return presentPost(row, viewer.id);
  }

  private async existingPost(viewer: IViewer, input: IPostInput, client: TDatabaseClient) {
    if (input.clientRequestId) {
      const post = await client.post.findUnique({
        where: { authorId_clientRequestId: { authorId: viewer.id, clientRequestId: input.clientRequestId } },
        include: postInclude(viewer.id),
      });
      if (post && post.groupId !== input.groupId) fail('이미 사용한 게시 요청입니다.', ERROR_CODE.CONFLICT);
      if (post) return post;
    }
    if (!input.uploadId) return null;
    const post = await client.post.findUnique({
      where: { uploadId: input.uploadId },
      include: postInclude(viewer.id),
    });
    return post?.authorId === viewer.id && post.groupId === input.groupId ? post : null;
  }
  async update(
    viewer: IViewer,
    input: { postId: string; title: string; body?: string | null; categoryId?: string | null },
  ) {
    const title = textValue(input.title, POST_TITLE_LIMIT, '제목');
    const body = input.body?.trim() ?? '';
    if (body.length > POST_BODY_LIMIT) fail('내용은 5000자 이하로 입력해 주세요.');
    return this.transactions.atomic(async (tx) => {
      const { post, admin } = await this.membership.accessiblePost(viewer.id, input.postId, tx);
      if (!admin && post.authorId !== viewer.id)
        fail('작성자와 그룹 관리자만 수정할 수 있습니다.', ERROR_CODE.FORBIDDEN);
      // 보관된 기존 분류는 유지할 수 있고, 다른 분류를 고를 때는 활성 여부를 확인한다.
      if (input.categoryId !== undefined && input.categoryId !== null && input.categoryId !== post.categoryId)
        await this.categories.requireActive(post.groupId, input.categoryId, tx);
      const row = await tx.post.update({
        where: { id: post.id },
        data: {
          title,
          ...(input.body !== undefined ? { body } : {}),
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        },
        include: postInclude(viewer.id),
      });
      await recordEvent(tx, {
        id: `post-updated:${post.id}:${crypto.randomUUID()}`,
        type: ANALYTICS_EVENT.POST_UPDATED,
        userId: viewer.id,
        properties: { postId: post.id, groupId: post.groupId },
      });
      return presentPost(row, viewer.id);
    });
  }

  async like(viewer: IViewer, postId: string, liked: boolean) {
    await this.transactions
      .run(async (tx) => {
        const { post } = await this.membership.accessiblePost(viewer.id, postId, tx);
        if (post.contestId) {
          // 한 회원의 같은 대회 반응만 순서대로 처리한다. 서로 다른 회원은 같은 작품에도 동시에 반응할 수 있다.
          const key = `post-contest-like:${post.contestId}:${viewer.id}`;
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
        }
        const existing =
          liked && post.contestId
            ? await tx.postLike.findUnique({ where: { postId_userId: { postId, userId: viewer.id } } })
            : null;
        if (liked && !existing && post.contestId) {
          const contest = await tx.contest.findUniqueOrThrow({ where: { id: post.contestId } });
          // 숨긴 작품은 목록에 없어 취소할 수 없으므로 한도에서 뺀다. 그렇지 않으면 그 대회의 좋아요가 잠긴다.
          const count = await tx.postLike.count({
            where: { userId: viewer.id, post: { contestId: post.contestId, hidden: false } },
          });
          if (count >= contest.likeLimit)
            fail(
              `이 대회에서는 ${contest.likeLimit}개 작품까지만 좋아요를 남길 수 있어요. 다른 작품의 좋아요를 취소한 뒤 다시 선택해 주세요.`,
            );
        }
        if (liked) {
          const { count } = await tx.postLike.createMany({
            data: [{ postId, userId: viewer.id }],
            skipDuplicates: true,
          });
          if (count > 0)
            await recordEvent(tx, {
              id: `post-like:${postId}:${viewer.id}`,
              type: ANALYTICS_EVENT.POST_LIKED,
              userId: viewer.id,
              properties: { postId },
            });
        }
        if (!liked) await tx.postLike.deleteMany({ where: { postId, userId: viewer.id } });
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2003', 'P2025'].includes(error.code))
          fail('게시물을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
        throw error;
      });
    // 전체 반응 수는 커밋 뒤 읽어 서로 다른 회원의 쓰기까지 직렬화 대상으로 묶지 않는다.
    return this.find(viewer, postId);
  }
  async delete(viewer: IViewer, postId: string) {
    const upload = await this.transactions.atomic(async (tx) => {
      const { post, admin } = await this.membership.accessiblePost(viewer.id, postId, tx);
      if (!admin && post.authorId !== viewer.id)
        fail('작성자와 그룹 관리자만 삭제할 수 있습니다.', ERROR_CODE.FORBIDDEN);
      await (tx ?? this.db).post.delete({ where: { id: postId } });
      await recordEvent(tx ?? this.db, {
        id: `post-deleted:${postId}`,
        type: ANALYTICS_EVENT.POST_DELETED,
        userId: viewer.id,
        properties: { postId, groupId: post.groupId },
      });
      if (post.legacySubmissionId)
        await (tx ?? this.db).submission.deleteMany({ where: { id: post.legacySubmissionId } });
      if (post.uploadId) await this.files.releaseUpload(post.uploadId, tx);
      return post.upload;
    });
    await this.files.cleanup(upload);
    return true;
  }
}
