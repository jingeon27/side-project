import { Inject, Injectable } from '@nestjs/common';

import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { ApiError } from '../common/http/api-error';
import type { MediaUploadDto } from '../common/media-upload.dto';
import { PrismaClient } from '../generated/prisma';
import { MEDIA_UPLOAD_TTL_SECONDS } from '../media-storage/media-storage.policy';
import { MediaStorage } from '../media-storage/media-storage.service';
import { presentPostMedia } from './post-media.presenter';
import { PostMediaService } from './post-media.service';

@Injectable()
export class PostMediaUploadService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(MediaStorage) private readonly storage: MediaStorage,
    @Inject(PostMediaService) private readonly media: PostMediaService,
  ) {}

  async request(req: SessionRequest, input: MediaUploadDto) {
    const user = requireUser(req);
    const upload = await this.storage.reserveUpload(input.mimeType, input.size);
    if (!upload) return { mode: 'PROXY' as const };
    const row = await this.media.register(user.id, input, { bytes: null, objectId: upload.objectId }, false);
    return {
      mode: 'DIRECT' as const,
      id: row.id,
      ...upload.form,
      expiresAt: upload.expiresAt,
    };
  }

  async complete(req: SessionRequest, id: string) {
    const user = requireUser(req);
    const file = await this.db.postMedia.findFirst({
      where: { id, uploaderId: user.id, postId: null },
      include: { object: true },
    });
    if (!file) throw new ApiError(404, 'MEDIA_NOT_FOUND', '업로드 요청을 찾을 수 없습니다.');
    if (file.uploadedAt) return presentPostMedia(file);
    if (file.createdAt.getTime() + MEDIA_UPLOAD_TTL_SECONDS * 1000 <= Date.now())
      throw new ApiError(409, 'UPLOAD_EXPIRED', '업로드 요청이 만료되었습니다. 파일을 다시 선택해주세요.');
    const stored = await this.storage.completeUpload(file);
    await this.db.postMedia.updateMany({
      where: { id, uploaderId: user.id, postId: null, uploadedAt: null, objectId: file.objectId },
      data: { ...stored, uploadedAt: new Date() },
    });
    const completed = await this.db.postMedia.findFirst({
      where: { id, uploaderId: user.id, uploadedAt: { not: null } },
    });
    if (!completed) throw new ApiError(404, 'MEDIA_NOT_FOUND', '업로드 요청을 찾을 수 없습니다.');
    return presentPostMedia(completed);
  }
}
