import { presentPost } from './post.presenter';
import { assertContestParticipation } from '../contest/group-contest.policy';
import { postInclude } from './post.query';
import { UnitOfWork } from '../database/unit-of-work';
import { PostRepository } from './post.repository';
import type { FileUpload } from 'graphql-upload/processRequest.mjs';

import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma';
import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import type { IViewer } from '../auth/session.service';
import { readUpload } from '../common/graphql/read-upload';
import { MAX_VIDEO_BYTES } from '../config/limits';
import { randomToken, sha256Hex } from '../common/crypto';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import { pageRange, textValue } from '../common/validation';
import {
  MAX_PENDING_UPLOADS,
  PAGE_SIZE_DEFAULT,
  POST_BODY_LIMIT,
  POST_TITLE_LIMIT,
  UPLOAD_TICKET_TTL_MS,
} from '../config/limits';
import { MembershipService } from '../group/membership.service';
import { reportUnexpectedError } from '../monitoring/sentry';
import { createMediaKey, MediaStorage } from '../storage/media-storage.service';
import { MediaProcessor } from './media-processor';
import { postLink } from './post-link.policy';
import { mediaDownloadDisposition, mediaDownloadFilename } from './media-download.policy';
import { DOWNLOAD_URL_TTL_SECONDS } from '../config/limits';

interface IPostInput {
  groupId: string;
  uploadId?: string | null;
  linkUrl?: string | null;
  contestId?: string | null;
  title: string;
  body?: string | null;
  rightsConfirmed: boolean;
}
interface IPostQuery {
  groupId?: string | null;
  contestId?: string | null;
  sort?: 'NEWEST' | 'MONTHLY_POPULAR' | null;
  offset?: number | null;
  limit?: number | null;
}
@Injectable()
export class PostService {
  constructor(
    private readonly repository: PostRepository,
    private readonly transactions: UnitOfWork,
    private readonly membership: MembershipService,
    private readonly storage: MediaStorage,
    private readonly processor: MediaProcessor,
  ) {}

  async list(viewer: IViewer | null, query: IPostQuery) {
    const { offset, limit } = pageRange(query.offset ?? 0, query.limit ?? PAGE_SIZE_DEFAULT);
    if (!query.groupId && !viewer) fail(ERROR_MESSAGE.LOGIN_REQUIRED, ERROR_CODE.UNAUTHENTICATED);
    const groupIds = query.groupId
      ? [(await this.membership.readableGroup(viewer?.id ?? null, query.groupId)).group.id]
      : await this.membership.memberGroupIds(viewer?.id ?? '');
    const popular = query.sort === 'MONTHLY_POPULAR';
    const rows = await this.repository.listVisiblePosts({
      groupIds,
      contestId: query.contestId,
      viewerId: viewer?.id ?? null,
      popular,
      offset,
      limit,
    });
    return rows.map((row) => presentPost(row, viewer?.id ?? null));
  }
  async requestUpload(viewer: IViewer, groupId: string) {
    const token = randomToken();
    const upload = await this.transactions.atomic(async (tx) => {
      await this.membership.requireMember(viewer.id, groupId, tx);
      const now = new Date();
      const pending = await this.repository.countPostUpload(
        {
          where: { userId: viewer.id, expiresAt: { gt: now }, post: null },
        },
        tx,
      );
      if (pending >= MAX_PENDING_UPLOADS)
        fail('업로드 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', ERROR_CODE.RATE_LIMITED);
      return this.repository.createPostUpload(
        {
          data: {
            userId: viewer.id,
            groupId,
            tokenHash: sha256Hex(token),
            expiresAt: new Date(now.getTime() + UPLOAD_TICKET_TTL_MS),
          },
        },
        tx,
      );
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
    const grant = await this.repository.findUniquePostUpload({ where });
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
      const updated = await this.repository.updateManyPostUpload({
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
        ? await this.repository.findUniquePostUpload({ where: { id: input.uploadId } }, tx)
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
        const contest = await this.repository.findUniqueContest({ where: { id: input.contestId } }, tx);
        if (!contest) fail('대회를 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
        assertContestParticipation(contest, input.groupId);
      }
      const created = await this.repository.createPost(
        {
          data: {
            groupId: input.groupId,
            authorId: viewer.id,
            uploadId: upload?.id ?? null,
            linkUrl,
            title,
            body,
            contestId: input.contestId ?? null,
          },
          include: postInclude(viewer.id),
        },
        tx,
      );
      await this.repository.recordEvent(tx, {
        id: `post:${created.id}`,
        type: ANALYTICS_EVENT.POST_CREATED,
        userId: viewer.id,
        properties: { groupId: input.groupId, postId: created.id, kind: upload?.kind ?? 'LINK' },
      });
      return created;
    });
    return presentPost(row, viewer.id);
  }
  async like(viewer: IViewer, postId: string, liked: boolean) {
    const row = await this.transactions.atomic(async (tx) => {
      await this.membership.accessiblePost(viewer.id, postId, tx);
      if (liked)
        await this.repository.upsertPostLike(
          {
            where: { postId_userId: { postId, userId: viewer.id } },
            create: { postId, userId: viewer.id },
            update: {},
          },
          tx,
        );
      if (!liked) await this.repository.deleteManyPostLike({ where: { postId, userId: viewer.id } }, tx);
      if (liked)
        await this.repository.recordEvent(tx, {
          id: `post-like:${postId}:${viewer.id}`,
          type: ANALYTICS_EVENT.POST_LIKED,
          userId: viewer.id,
          properties: { postId },
        });
      return this.repository.findUniqueOrThrowPost(
        { where: { id: postId }, include: postInclude(viewer.id) },
        tx,
      );
    });
    return presentPost(row, viewer.id);
  }
  async delete(viewer: IViewer, postId: string) {
    const upload = await this.transactions.atomic(async (tx) => {
      const { post, admin } = await this.membership.accessiblePost(viewer.id, postId, tx);
      if (!admin && post.authorId !== viewer.id)
        fail('작성자와 그룹 관리자만 삭제할 수 있습니다.', ERROR_CODE.FORBIDDEN);
      await this.repository.deletePost({ where: { id: postId } }, tx);
      await this.repository.recordEvent(tx, {
        id: `post-deleted:${postId}`,
        type: ANALYTICS_EVENT.POST_DELETED,
        userId: viewer.id,
        properties: { postId, groupId: post.groupId },
      });
      if (post.legacySubmissionId)
        await this.repository.deleteManySubmission({ where: { id: post.legacySubmissionId } }, tx);
      // 파일 삭제가 일시 실패해도 정리 작업이 다시 시도할 수 있도록 티켓을 남긴다.
      if (post.uploadId)
        await this.repository.updatePostUpload(
          { where: { id: post.uploadId }, data: { expiresAt: new Date(0) } },
          tx,
        );
      return post.upload;
    });
    if (!upload) return true;
    try {
      if (upload.storageKey) await this.storage.delete(upload.storageKey);
      await this.repository.deleteManyPostUpload({ where: { id: upload.id, post: null } });
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
