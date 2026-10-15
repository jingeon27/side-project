import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma';
import { ANALYTICS_EVENT, recordEvent } from '../analytics/analytics-event';
import type { IViewer } from '../auth/session.service';
import { randomToken, sha256Hex } from '../common/crypto';
import { ERROR_CODE, fail } from '../common/errors';
import { pageRange, textValue } from '../common/validation';
import {
  MAX_PENDING_UPLOADS,
  PAGE_SIZE_DEFAULT,
  POST_BODY_LIMIT,
  POST_TITLE_LIMIT,
  UPLOAD_TICKET_TTL_MS,
} from '../config/limits';
import { Database } from '../database/database.service';
import { isOwner } from '../group/group-role';
import { MembershipService } from '../group/membership.service';
import { reportUnexpectedError } from '../monitoring/sentry';
import { createMediaKey, MediaStorage } from '../storage/media-storage.service';
import { MediaProcessor } from './media-processor';
import { koreanMonth } from './post-order';

interface IPostInput {
  groupId: string;
  uploadId: string;
  title: string;
  body?: string | null;
  rightsConfirmed: boolean;
}
interface IPostQuery {
  groupId?: string | null;
  sort?: 'NEWEST' | 'MONTHLY_POPULAR' | null;
  offset?: number | null;
  limit?: number | null;
}
function postInclude(userId: string) {
  return {
    group: { select: { name: true, members: { where: { userId }, select: { role: true } } } },
    author: true,
    upload: true,
    _count: { select: { likes: true } },
    likes: { where: { userId }, select: { userId: true } },
  } satisfies Prisma.PostInclude;
}
type TPostRow = Prisma.PostGetPayload<{ include: ReturnType<typeof postInclude> }>;
function present(row: TPostRow, userId: string) {
  return {
    id: row.id,
    groupId: row.groupId,
    groupName: row.group.name,
    title: row.title,
    body: row.body,
    author: row.author,
    createdAt: row.createdAt,
    kind: row.upload.kind,
    mediaUrl: `/backend/media/${row.id}`,
    likeCount: row._count.likes,
    likedByMe: row.likes.length > 0,
    canDelete: row.authorId === userId || row.group.members.some(isOwner),
  };
}
@Injectable()
export class PostService {
  constructor(
    private readonly db: Database,
    private readonly membership: MembershipService,
    private readonly storage: MediaStorage,
    private readonly processor: MediaProcessor,
  ) {}

  async list(viewer: IViewer, query: IPostQuery) {
    const { offset, limit } = pageRange(query.offset ?? 0, query.limit ?? PAGE_SIZE_DEFAULT);
    const groupIds = query.groupId
      ? [(await this.membership.requireMember(viewer.id, query.groupId)).groupId]
      : await this.membership.memberGroupIds(viewer.id);
    const popular = query.sort === 'MONTHLY_POPULAR';
    const rows = await this.db.post.findMany({
      where: {
        groupId: { in: groupIds },
        hidden: false,
        OR: [{ legacySubmissionId: null }, { legacySubmission: { hidden: false } }],
        ...(popular ? { createdAt: koreanMonth() } : {}),
      },
      include: postInclude(viewer.id),
      skip: offset,
      take: limit,
      orderBy: [
        ...(popular ? [{ likes: { _count: 'desc' as const } }] : []),
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    });
    return rows.map((row) => present(row, viewer.id));
  }
  async requestUpload(viewer: IViewer, groupId: string) {
    const token = randomToken();
    const upload = await this.db.atomic(async (tx) => {
      await this.membership.requireMember(viewer.id, groupId, tx);
      const now = new Date();
      const pending = await tx.postUpload.count({
        where: { userId: viewer.id, expiresAt: { gt: now }, post: null },
      });
      if (pending >= MAX_PENDING_UPLOADS)
        fail('업로드 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', ERROR_CODE.RATE_LIMITED);
      return tx.postUpload.create({
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
    const grant = await this.db.postUpload.findUnique({ where: { tokenHash: sha256Hex(token) } });
    if (!grant || grant.userId !== viewer.id || grant.storageKey || grant.expiresAt <= new Date())
      fail('업로드 요청이 만료되었거나 유효하지 않습니다.', ERROR_CODE.FORBIDDEN);
    await this.membership.requireMember(viewer.id, grant.groupId);
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
    const row = await this.db.atomic(async (tx) => {
      await this.membership.requireMember(viewer.id, input.groupId, tx);
      const upload = await tx.postUpload.findUnique({ where: { id: input.uploadId } });
      if (
        !upload ||
        upload.userId !== viewer.id ||
        upload.groupId !== input.groupId ||
        !upload.storageKey ||
        upload.expiresAt <= new Date()
      )
        fail('업로드가 완료되지 않았거나 만료되었습니다.');
      const created = await tx.post.create({
        data: { groupId: input.groupId, authorId: viewer.id, uploadId: upload.id, title, body },
        include: postInclude(viewer.id),
      });
      await recordEvent(tx, {
        id: `post:${created.id}`,
        type: ANALYTICS_EVENT.POST_CREATED,
        userId: viewer.id,
        properties: { groupId: input.groupId, postId: created.id, kind: upload.kind },
      });
      return created;
    });
    return present(row, viewer.id);
  }
  async like(viewer: IViewer, postId: string, liked: boolean) {
    const row = await this.db.atomic(async (tx) => {
      await this.membership.accessiblePost(viewer.id, postId, tx);
      if (liked)
        await tx.postLike.upsert({
          where: { postId_userId: { postId, userId: viewer.id } },
          create: { postId, userId: viewer.id },
          update: {},
        });
      else await tx.postLike.deleteMany({ where: { postId, userId: viewer.id } });
      if (liked)
        await recordEvent(tx, {
          id: `post-like:${postId}:${viewer.id}`,
          type: ANALYTICS_EVENT.POST_LIKED,
          userId: viewer.id,
          properties: { postId },
        });
      return tx.post.findUniqueOrThrow({ where: { id: postId }, include: postInclude(viewer.id) });
    });
    return present(row, viewer.id);
  }
  async delete(viewer: IViewer, postId: string) {
    const upload = await this.db.atomic(async (tx) => {
      const { post, admin } = await this.membership.accessiblePost(viewer.id, postId, tx);
      if (!admin && post.authorId !== viewer.id)
        fail('작성자와 갤러리 관리자만 삭제할 수 있습니다.', ERROR_CODE.FORBIDDEN);
      await tx.post.delete({ where: { id: postId } });
      await recordEvent(tx, {
        id: `post-deleted:${postId}`,
        type: ANALYTICS_EVENT.POST_DELETED,
        userId: viewer.id,
        properties: { postId, groupId: post.groupId },
      });
      if (post.legacySubmissionId) await tx.submission.deleteMany({ where: { id: post.legacySubmissionId } });
      // 파일 삭제가 일시 실패해도 정리 작업이 다시 시도할 수 있도록 티켓을 남긴다.
      await tx.postUpload.update({ where: { id: post.uploadId }, data: { expiresAt: new Date(0) } });
      return post.upload;
    });
    try {
      if (upload.storageKey) await this.storage.delete(upload.storageKey);
      await this.db.postUpload.deleteMany({ where: { id: upload.id, post: null } });
    } catch (error) {
      reportUnexpectedError(error, { operationName: 'deletePost', location: 'media-cleanup' });
    }
    return true;
  }
  async file(viewer: IViewer, postId: string) {
    const { post } = await this.membership.accessiblePost(viewer.id, postId);
    if (!post.upload.storageKey) fail('파일을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
    return { key: post.upload.storageKey, size: post.upload.byteSize, contentType: post.upload.contentType };
  }
}
