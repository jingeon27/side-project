import { Inject, Injectable } from '@nestjs/common';
import { omit } from 'es-toolkit';

import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { ApiError } from '../common/http/api-error';
import { UnitOfWork } from '../database/unit-of-work';
import { PrismaClient } from '../generated/prisma';
import { MediaStorage } from '../media-storage/media-storage.service';
import { attachmentDto, attachmentSelect } from './chat-attachment.presenter';
import { validateChatFile } from './chat-file';
import { historyWhere } from './chat-history';

@Injectable()
export class ChatAttachmentService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(MediaStorage) private readonly storage: MediaStorage,
  ) {}
  async upload(req: SessionRequest, conversationId: string, input: unknown) {
    const user = requireUser(req);
    const file = validateChatFile(input);
    const metadata = omit(file, ['bytes']);
    const stored = await this.storage.save(file.bytes, file.mimeType);
    return attachmentDto(await this.register(user.id, conversationId, metadata, stored));
  }
  async register(
    userId: string,
    conversationId: string,
    metadata: { name: string; mimeType: string; size: number },
    stored: Awaited<ReturnType<MediaStorage['save']>>,
    ready = true,
  ) {
    return this.transactions.run(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      await (tx ?? this.db).chatAttachment.deleteMany({
        where: { uploaderId: userId, messageId: null, createdAt: { lt: new Date(Date.now() - 86400000) } },
      });
      const pending = await (tx ?? this.db).chatAttachment.count({
        where: { uploaderId: userId, messageId: null },
      });
      if (pending >= 4)
        throw new ApiError(409, 'ATTACHMENT_LIMIT', '전송 대기 중인 첨부파일을 먼저 정리해주세요.');
      return (tx ?? this.db).chatAttachment.create({
        data: {
          conversationId,
          uploaderId: userId,
          ...metadata,
          ...stored,
          uploadedAt: ready ? new Date() : null,
        },
        select: attachmentSelect,
      });
    });
  }
  async file(req: SessionRequest, conversationId: string, id: string) {
    const user = requireUser(req);
    const conversation = await this.db.chatConversation.findFirst({
      where: { id: conversationId, OR: [{ firstUserId: user.id }, { secondUserId: user.id }] },
      include: { support: { select: { historyStartAt: true, historyStartId: true } } },
    });
    if (!conversation) throw new ApiError(404, 'ATTACHMENT_NOT_FOUND', '첨부파일을 찾을 수 없습니다.');
    const file = await this.db.chatAttachment.findFirst({
      include: { object: true },
      where: {
        id,
        conversationId,
        uploadedAt: { not: null },
        OR: [
          {
            message: { is: historyWhere(conversation, user.id) },
          },
          { messageId: null, uploaderId: user.id },
        ],
      },
    });
    if (!file) throw new ApiError(404, 'ATTACHMENT_NOT_FOUND', '첨부파일을 찾을 수 없습니다.');
    return file;
  }
  content(...args: Parameters<MediaStorage['read']>) {
    return this.storage.read(...args);
  }
  location(...args: Parameters<MediaStorage['presignRead']>) {
    return this.storage.presignRead(...args);
  }
  async remove(req: SessionRequest, conversationId: string, id: string) {
    const user = requireUser(req);
    const result = await this.db.chatAttachment.deleteMany({
      where: { id, conversationId, uploaderId: user.id, messageId: null },
    });
    if (!result.count) throw new ApiError(404, 'ATTACHMENT_NOT_FOUND', '첨부파일을 찾을 수 없습니다.');
    return { ok: true };
  }
}
