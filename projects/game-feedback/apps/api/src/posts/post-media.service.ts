import { Inject, Injectable } from '@nestjs/common';
import { richTextMediaReferences, type TRichTextDocument } from '@game-feedback/contracts';
import { PrismaClient, type Prisma } from '../generated/prisma';
import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { ACTIVE_POST } from '../common/content';
import { ApiError } from '../common/http/api-error';
import { validateMediaFile } from '../common/media-file';
import { UserVisibilityService } from '../users/user-visibility.service';

@Injectable()
export class PostMediaService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
  ) {}
  async upload(req: SessionRequest, input: unknown) {
    const user = requireUser(req);
    const file = validateMediaFile(input);
    const row = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
      await tx.postMedia.deleteMany({
        where: { uploaderId: user.id, postId: null, createdAt: { lt: new Date(Date.now() - 86400000) } },
      });
      if ((await tx.postMedia.count({ where: { uploaderId: user.id, postId: null } })) >= 20)
        throw new ApiError(
          409,
          'MEDIA_LIMIT',
          '작성 대기 중인 파일이 많습니다. 기존 초안을 먼저 등록해주세요.',
        );
      return tx.postMedia.create({
        data: { ...file, bytes: Uint8Array.from(file.bytes), uploaderId: user.id },
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
      where: {
        id,
        OR: [
          { postId: null, uploaderId: req.gfSession?.user?.id ?? '' },
          { post: { ...ACTIVE_POST, authorId: { notIn: excluded } } },
        ],
      },
    });
    if (!file) throw new ApiError(404, 'MEDIA_NOT_FOUND', '미디어를 찾을 수 없습니다.');
    return file;
  }
  async remove(req: SessionRequest, id: string) {
    const user = requireUser(req);
    const removed = await this.db.postMedia.deleteMany({ where: { id, uploaderId: user.id, postId: null } });
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
      const linked = await tx.postMedia.updateMany({
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
    await tx.postMedia.deleteMany({ where: { postId, id: { notIn: refs.map((ref) => ref.id) } } });
  }
}
