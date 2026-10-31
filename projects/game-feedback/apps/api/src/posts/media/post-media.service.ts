import { Inject, Injectable } from '@nestjs/common';

import { richTextMediaReferences, type TRichTextDocument } from '@game-feedback/contracts';

import { lockActiveUser } from '../../auth/account/user-write';
import { requireUser } from '../../auth/session/session-access';
import type { SessionRequest } from '../../auth/session/session.types';
import { ACTIVE_POST } from '../../common/content';
import { ApiError } from '../../common/http/api-error';
import { UnitOfWork } from '../../database/unit-of-work';
import { PrismaClient, type MediaObject, type Prisma } from '../../generated/prisma';
import { MediaStorage } from '../../media-storage/media-storage.service';
import { UserVisibilityService } from '../../users/visibility/user-visibility.service';

@Injectable()
export class PostMediaService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
    @Inject(MediaStorage) private readonly storage: MediaStorage,
  ) {}
  async register(
    uploaderId: string,
    metadata: { name: string; mimeType: string; size: number },
    stored: Pick<MediaObject, 'backend' | 'key'>,
  ) {
    return this.transactions.run(async (tx) => {
      await lockActiveUser({ client: tx, userId: uploaderId });
      await tx.postMedia.deleteMany({
        where: { uploaderId, postId: null, createdAt: { lt: new Date(Date.now() - 86400000) } },
      });
      if ((await tx.postMedia.count({ where: { uploaderId, postId: null } })) >= 20)
        throw new ApiError(
          409,
          'MEDIA_LIMIT',
          '작성 대기 중인 파일이 많습니다. 기존 초안을 먼저 등록해주세요.',
        );
      const object = await tx.mediaObject.create({ data: stored, select: { id: true } });
      return tx.postMedia.create({
        data: { ...metadata, bytes: null, objectId: object.id, uploaderId, uploadedAt: null },
        select: { id: true, name: true, mimeType: true, size: true },
      });
    });
  }
  async file(req: SessionRequest, id: string) {
    const excluded = await this.visibility.excluded(req);
    const file = await this.db.postMedia.findFirst({
      include: { object: true },
      where: {
        id,
        uploadedAt: { not: null },
        OR: [
          { postId: null, uploaderId: req.gfSession?.user?.id ?? '' },
          {
            post: {
              ...ACTIVE_POST,
              authorId: {
                notIn: excluded,
              },
            },
          },
        ],
      },
    });
    if (!file) throw new ApiError(404, 'MEDIA_NOT_FOUND', '미디어를 찾을 수 없습니다.');
    return file;
  }
  location(...args: Parameters<MediaStorage['presignRead']>) {
    return this.storage.presignRead(...args);
  }
  async remove(req: SessionRequest, id: string) {
    const user = requireUser(req);
    const removed = await this.db.postMedia.deleteMany({
      where: { id, uploaderId: user.id, postId: null },
    });
    if (!removed.count) throw new ApiError(404, 'MEDIA_NOT_FOUND', '미디어를 찾을 수 없습니다.');
    return { ok: true };
  }
  async sync(
    tx: Prisma.TransactionClient,
    userId: string,
    postId: string,
    document?: TRichTextDocument | null,
  ) {
    const refs = richTextMediaReferences(document);
    if (refs.length) {
      const linked = await (tx ?? this.db).postMedia.updateMany({
        where: {
          uploaderId: userId,
          uploadedAt: { not: null },
          OR: refs.map((ref) => ({
            id: ref.id,
            mimeType: { startsWith: ref.kind === 'IMAGE' ? 'image/' : 'video/' },
          })),
          AND: [{ OR: [{ postId: null }, { postId }] }],
        },
        data: { postId },
      });
      if (linked.count !== refs.length)
        throw new ApiError(400, 'INVALID_MEDIA', '본문에 넣을 사진이나 동영상을 다시 선택해주세요.');
    }
    await (tx ?? this.db).postMedia.deleteMany({
      where: { postId, id: { notIn: refs.map((ref) => ref.id) } },
    });
  }
}
