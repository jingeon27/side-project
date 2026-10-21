import { Inject, Injectable } from '@nestjs/common';

import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { ApiError } from '../common/http/api-error';
import type { MediaUploadDto } from '../common/media-upload.dto';
import { PrismaClient } from '../generated/prisma';
import { MEDIA_UPLOAD_TTL_SECONDS } from '../media-storage/media-storage.policy';
import { MediaStorage } from '../media-storage/media-storage.service';
import { attachmentDto } from './chat-attachment.presenter';
import { ChatAttachmentService } from './chat-attachment.service';

@Injectable()
export class ChatAttachmentUploadService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(MediaStorage) private readonly storage: MediaStorage,
    @Inject(ChatAttachmentService) private readonly attachments: ChatAttachmentService,
  ) {}

  async request(req: SessionRequest, conversationId: string, input: MediaUploadDto) {
    const user = requireUser(req);
    const upload = await this.storage.reserveUpload(input.mimeType, input.size);
    if (!upload) return { mode: 'PROXY' as const };
    const row = await this.attachments.register(
      user.id,
      conversationId,
      input,
      { bytes: null, objectId: upload.objectId },
      false,
    );
    return { mode: 'DIRECT' as const, id: row.id, ...upload.form, expiresAt: upload.expiresAt };
  }

  async complete(req: SessionRequest, conversationId: string, id: string) {
    const user = requireUser(req);
    const file = await this.db.chatAttachment.findFirst({
      where: { id, conversationId, uploaderId: user.id, messageId: null },
      include: { object: true },
    });
    if (!file) throw new ApiError(404, 'ATTACHMENT_NOT_FOUND', '업로드 요청을 찾을 수 없습니다.');
    if (file.uploadedAt) return attachmentDto(file);
    if (file.createdAt.getTime() + MEDIA_UPLOAD_TTL_SECONDS * 1000 <= Date.now())
      throw new ApiError(409, 'UPLOAD_EXPIRED', '업로드 요청이 만료되었습니다. 파일을 다시 선택해주세요.');
    const stored = await this.storage.completeUpload(file);
    await this.db.chatAttachment.updateMany({
      where: {
        id,
        conversationId,
        uploaderId: user.id,
        messageId: null,
        uploadedAt: null,
        objectId: file.objectId,
      },
      data: { ...stored, uploadedAt: new Date() },
    });
    const completed = await this.db.chatAttachment.findFirst({
      where: { id, conversationId, uploaderId: user.id, uploadedAt: { not: null } },
    });
    if (!completed) throw new ApiError(404, 'ATTACHMENT_NOT_FOUND', '업로드 요청을 찾을 수 없습니다.');
    return attachmentDto(completed);
  }
}
