import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma';
import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import { recordEvent } from '../analytics/analytics-event.writer';
import type { IViewer } from '../auth/session.service';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import { pageRange, textValue } from '../common/validation';
import {
  MEDIA_URL_TTL_SECONDS,
  PAGE_SIZE_DEFAULT,
  POST_BODY_LIMIT,
  POST_TITLE_LIMIT,
} from '../config/limits';
import { assertContestParticipation } from '../contest/group-contest.policy';
import { Database } from '../database/database.service';
import { UnitOfWork } from '../database/unit-of-work';
import { GroupCategoryService } from '../group/group-category.service';
import { MembershipService } from '../group/membership.service';
import { MediaUploadService } from '../media-upload/media-upload.service';
import { reportUnexpectedError } from '../monitoring/sentry';
import { MediaStorage } from '../storage/media-storage.service';
import { mediaDownloadDisposition, mediaDownloadFilename } from './media-download.policy';
import { postLink } from './post-link.policy';
import { koreanMonth } from './post-order';
import { presentPost } from './post.presenter';
import { postInclude } from './post.query';

interface IPostInput {
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
    private readonly storage: MediaStorage,
    private readonly uploads: MediaUploadService,
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
  requestUpload(viewer: IViewer, groupId: string, contentType: string, byteSize: number) {
    return this.uploads.requestUpload(viewer, groupId, contentType, byteSize);
  }
  completeUpload(viewer: IViewer, uploadId: string) {
    return this.uploads.completeUpload(viewer, uploadId);
  }
  async create(viewer: IViewer, input: IPostInput) {
    if (!input.rightsConfirmed) fail('공유할 권리와 촬영된 사람의 동의를 확인해 주세요.');
    const title = textValue(input.title, POST_TITLE_LIMIT, '제목');
    const body = input.body?.trim() ?? '';
    if (body.length > POST_BODY_LIMIT) fail('내용은 5000자 이하로 입력해 주세요.');
    const linkUrl = postLink(input.linkUrl);
    if (!input.uploadId && !linkUrl) fail('사진·동영상 또는 링크를 첨부해 주세요.');
    const row = await this.transactions.atomic(async (tx) => {
      await this.membership.requireMember(viewer.id, input.groupId, tx);
      const upload = input.uploadId
        ? await (tx ?? this.db).postUpload.findUnique({
            where: { id: input.uploadId },
            include: { submissionUpload: true, groupAvatar: true },
          })
        : null;
      if (
        input.uploadId &&
        (!upload ||
          upload.submissionUpload !== null ||
          upload.groupAvatar !== null ||
          upload.userId !== viewer.id ||
          upload.groupId !== input.groupId ||
          !upload.storageKey ||
          upload.expiresAt <= new Date())
      )
        fail('업로드가 완료되지 않았거나 만료되었습니다.');
      if (input.contestId) {
        const contest = await (tx ?? this.db).contest.findUnique({ where: { id: input.contestId } });
        if (!contest) fail('대회를 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
        assertContestParticipation(contest, input.groupId);
      }
      if (input.categoryId) await this.categories.requireActive(input.groupId, input.categoryId, tx);
      const created = await (tx ?? this.db).post.create({
        data: {
          groupId: input.groupId,
          categoryId: input.categoryId ?? null,
          authorId: viewer.id,
          uploadId: upload?.id ?? null,
          linkUrl,
          title,
          body,
          contestId: input.contestId ?? null,
        },
        include: postInclude(viewer.id),
      });
      await recordEvent(tx ?? this.db, {
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
    });
    return presentPost(row, viewer.id);
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
    const row = await this.transactions.atomic(async (tx) => {
      const { post } = await this.membership.accessiblePost(viewer.id, postId, tx);
      const existing = liked
        ? await tx.postLike.findUnique({ where: { postId_userId: { postId, userId: viewer.id } } })
        : null;
      if (liked && !existing && post.contestId) {
        const contest = await tx.contest.findUniqueOrThrow({ where: { id: post.contestId } });
        const count = await tx.postLike.count({
          where: { userId: viewer.id, post: { contestId: post.contestId } },
        });
        if (count >= contest.likeLimit)
          fail(
            `이 대회에서는 ${contest.likeLimit}개 작품까지만 좋아요를 남길 수 있어요. 다른 작품의 좋아요를 취소한 뒤 다시 선택해 주세요.`,
          );
      }
      if (liked && !existing)
        await (tx ?? this.db).postLike.upsert({
          where: { postId_userId: { postId, userId: viewer.id } },
          create: { postId, userId: viewer.id },
          update: {},
        });
      if (!liked) await (tx ?? this.db).postLike.deleteMany({ where: { postId, userId: viewer.id } });
      if (liked)
        await recordEvent(tx ?? this.db, {
          id: `post-like:${postId}:${viewer.id}`,
          type: ANALYTICS_EVENT.POST_LIKED,
          userId: viewer.id,
          properties: { postId },
        });
      return (tx ?? this.db).post.findUniqueOrThrow({
        where: { id: postId },
        include: postInclude(viewer.id),
      });
    });
    return presentPost(row, viewer.id);
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
      // 파일 삭제가 일시 실패해도 정리 작업이 다시 시도할 수 있도록 티켓을 남긴다.
      if (post.uploadId)
        await (tx ?? this.db).postUpload.update({
          where: { id: post.uploadId },
          data: { expiresAt: new Date(0) },
        });
      return post.upload;
    });
    if (!upload) return true;
    try {
      if (upload.storageKey) await this.storage.delete(upload.storageKey);
      if (upload.stagingKey) await this.storage.delete(upload.stagingKey);
      // POST 정책이 아직 유효하면 업로더가 같은 키에 다시 올릴 수 있다. 행을 남겨 정리 작업이 정책 만료 뒤에 다시 지운다.
      if (upload.policyExpiresAt && upload.policyExpiresAt > new Date()) return true;
      await this.db.postUpload.deleteMany({ where: { id: upload.id, post: null } });
    } catch (error) {
      reportUnexpectedError(error, { operationName: 'deletePost', location: 'media-cleanup' });
    }
    return true;
  }
  async file(viewer: IViewer | null, postId: string) {
    const { post } = await this.membership.readablePost(viewer?.id ?? null, postId);
    if (!post.upload?.storageKey) fail('파일을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
    return {
      key: post.upload.storageKey,
      filename: mediaDownloadFilename(post.title, post.upload.storageKey),
    };
  }
  async download(viewer: IViewer | null, postId: string) {
    const file = await this.file(viewer, postId);
    const url = await this.storage.presignRead(file.key, mediaDownloadDisposition(file.filename));
    return { url, filename: file.filename, expiresAt: new Date(Date.now() + MEDIA_URL_TTL_SECONDS * 1000) };
  }
}
