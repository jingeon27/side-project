import type { Prisma } from '../../generated/prisma';
import { recordEvent } from '../analytics/analytics-event.writer';
import { assertContestParticipation } from '../contest/group-contest.policy';
import { Database } from '../database/database.service';
import { UnitOfWork } from '../database/unit-of-work';
import { GroupCategoryService } from '../group/group-category.service';
import { koreanMonth } from './post-order';
import { presentPost } from './post.presenter';
import { postInclude } from './post.query';

import type { FileUpload } from 'graphql-upload/processRequest.mjs';

import { Injectable } from '@nestjs/common';

import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import type { IViewer } from '../auth/session.service';
import { randomToken, sha256Hex } from '../common/crypto';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import { readUpload } from '../common/graphql/read-upload';
import { pageRange, textValue } from '../common/validation';
import {
  DOWNLOAD_URL_TTL_SECONDS,
  MAX_PENDING_UPLOADS,
  MAX_VIDEO_BYTES,
  PAGE_SIZE_DEFAULT,
  POST_BODY_LIMIT,
  POST_TITLE_LIMIT,
  UPLOAD_TICKET_TTL_MS,
} from '../config/limits';
import { MembershipService } from '../group/membership.service';
import { reportUnexpectedError } from '../monitoring/sentry';
import { createMediaKey, MediaStorage } from '../storage/media-storage.service';
import { mediaDownloadDisposition, mediaDownloadFilename } from './media-download.policy';
import { MediaProcessor } from './media-processor';
import { postLink } from './post-link.policy';

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
    private readonly processor: MediaProcessor,
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
  async requestUpload(viewer: IViewer, groupId: string) {
    const token = randomToken();
    const upload = await this.transactions.atomic(async (tx) => {
      await this.membership.requireMember(viewer.id, groupId, tx);
      const now = new Date();
      const pending = await (tx ?? this.db).postUpload.count({
        where: { userId: viewer.id, expiresAt: { gt: now }, post: null },
      });
      if (pending >= MAX_PENDING_UPLOADS)
        fail('업로드 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', ERROR_CODE.RATE_LIMITED);
      return (tx ?? this.db).postUpload.create({
        data: {
          userId: viewer.id,
          groupId,
          tokenHash: sha256Hex(token),
          expiresAt: new Date(now.getTime() + UPLOAD_TICKET_TTL_MS),
        },
      });
    });
    return { id: upload.id, expiresAt: upload.expiresAt, url: `/backend/post-uploads/${token}` };
  }
  async upload(viewer: IViewer, token: string, body: unknown, contentType: string) {
    const grant = await this.uploadGrant(viewer, { tokenHash: sha256Hex(token) });
    await this.saveUpload(grant, body, contentType);
  }

  async uploadFile(viewer: IViewer, uploadId: string, file: Promise<FileUpload>) {
    const grant = await this.uploadGrant(viewer, { id: uploadId });
    const content = await readUpload(file, MAX_VIDEO_BYTES);
    await this.saveUpload(grant, content.body, content.contentType);
    return true;
  }

  private async uploadGrant(viewer: IViewer, where: Prisma.PostUploadWhereUniqueInput) {
    const grant = await this.db.postUpload.findUnique({ where });
    if (!grant || grant.userId !== viewer.id || grant.storageKey || grant.expiresAt <= new Date())
      fail('업로드 요청이 만료되었거나 유효하지 않습니다.', ERROR_CODE.FORBIDDEN);
    await this.membership.requireMember(viewer.id, grant.groupId);
    return grant;
  }

  private async saveUpload(
    grant: Awaited<ReturnType<PostService['uploadGrant']>>,
    body: unknown,
    contentType: string,
  ) {
    const media = await this.processor.process(body, contentType);
    const key = createMediaKey(media.extension);
    await this.storage.put(key, media.body, media.contentType);
    try {
      const updated = await this.db.postUpload.updateMany({
        where: { id: grant.id, storageKey: null, expiresAt: { gt: new Date() } },
        data: {
          storageKey: key,
          kind: media.kind,
          contentType: media.contentType,
          byteSize: media.body.length,
        },
      });
      if (updated.count !== 1) fail('이미 사용했거나 만료된 업로드입니다.', ERROR_CODE.CONFLICT);
    } catch (error) {
      await this.storage.delete(key);
      throw error;
    }
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
        ? await (tx ?? this.db).postUpload.findUnique({ where: { id: input.uploadId } })
        : null;
      if (
        input.uploadId &&
        (!upload ||
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
      await this.membership.accessiblePost(viewer.id, postId, tx);
      if (liked)
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
      size: post.upload.byteSize,
      contentType: post.upload.contentType,
      filename: mediaDownloadFilename(post.title, post.upload.storageKey),
    };
  }
  async download(viewer: IViewer | null, postId: string) {
    const file = await this.file(viewer, postId);
    const signedUrl = await this.storage.presignDownload(
      file.key,
      mediaDownloadDisposition(file.filename),
      DOWNLOAD_URL_TTL_SECONDS,
    );
    return {
      url: signedUrl ?? `/backend/media/${postId}/download`,
      filename: file.filename,
      expiresAt: signedUrl ? new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000) : null,
    };
  }
}
