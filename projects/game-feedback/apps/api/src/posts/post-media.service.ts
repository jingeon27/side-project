import { ACTIVE_POST } from '../common/content';
import { UnitOfWork } from '../database/unit-of-work';
import { PrismaClient, type Prisma } from '../generated/prisma';

import { richTextMediaReferences, type TRichTextDocument } from '@game-feedback/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { ApiError } from '../common/http/api-error';
import { validateMediaFile } from '../common/media-file';
import { MediaStorage } from '../media-storage/media-storage.service';
import { UserVisibilityService } from '../users/user-visibility.service';

@Injectable()
export class PostMediaService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
    @Inject(MediaStorage) private readonly storage: MediaStorage,
  ) {}
  async upload(req: SessionRequest, input: unknown) {
    const user = requireUser(req);
    const file = validateMediaFile(input);
    const { bytes: _bytes, ...metadata } = file;
    const stored = await this.storage.save(file.bytes, file.mimeType);
    const row = await this.transactions.run(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
      await (tx ?? this.db).postMedia.deleteMany({
        where: { uploaderId: user.id, postId: null, createdAt: { lt: new Date(Date.now() - 86400000) } },
      });
      if ((await (tx ?? this.db).postMedia.count({ where: { uploaderId: user.id, postId: null } })) >= 20)
        throw new ApiError(
          409,
          'MEDIA_LIMIT',
          '작성 대기 중인 파일이 많습니다. 기존 초안을 먼저 등록해주세요.',
        );
      return (tx ?? this.db).postMedia.create({
        data: { ...metadata, ...stored, uploaderId: user.id },
        select: { id: true, name: true, mimeType: true, size: true },
      });
    });
    return {
      ...row,
      kind: row.mimeType.startsWith('image/') ? 'IMAGE' : 'VIDEO',
      url: `/api/post-media/${row.id}`,
    };
  }
  async file(req: SessionRequest, id: string) {
    const excluded = await this.visibility.excluded(req);
    const file = await this.db.postMedia.findFirst({
      include: { object: true },
      where: {
        id,
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
  content(...args: Parameters<MediaStorage['read']>) {
    return this.storage.read(...args);
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
