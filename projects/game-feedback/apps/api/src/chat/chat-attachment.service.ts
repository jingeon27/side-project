import { UnitOfWork } from '../database/unit-of-work';
import { ChatRepository } from './chat.repository';
import { Inject, Injectable } from '@nestjs/common';
import type { SessionRequest } from '../auth/session.types';
import { requireUser } from '../auth/session-access';
import { ApiError } from '../common/http/api-error';
import { historyWhere } from './chat-history';
import { validateChatFile } from './chat-file';
import { attachmentDto, attachmentSelect } from './chat-attachment.presenter';
import { MediaStorage } from '../media-storage/media-storage.service';

@Injectable()
export class ChatAttachmentService {
  constructor(
    @Inject(ChatRepository) private readonly repository: ChatRepository,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(MediaStorage) private readonly storage: MediaStorage,
  ) {}
  async upload(req: SessionRequest, conversationId: string, input: unknown) {
    const user = requireUser(req);
    const file = validateChatFile(input);
    const { bytes: _bytes, ...metadata } = file;
    const stored = await this.storage.save(file.bytes, file.mimeType);
    const attachment = await this.transactions.run(async (tx) => {
      await this.repository.lockUser(user.id, tx);
      await this.repository.deleteManyChatAttachment(
        {
          where: { uploaderId: user.id, messageId: null, createdAt: { lt: new Date(Date.now() - 86400000) } },
        },
        tx,
      );
      const pending = await this.repository.countChatAttachment(
        { where: { uploaderId: user.id, messageId: null } },
        tx,
      );
      if (pending >= 4)
        throw new ApiError(409, 'ATTACHMENT_LIMIT', '전송 대기 중인 첨부파일을 먼저 정리해주세요.');
      return this.repository.createChatAttachment(
        {
          data: { conversationId, uploaderId: user.id, ...metadata, ...stored },
          select: attachmentSelect,
        },
        tx,
      );
    });
    return attachmentDto(attachment);
  }
  async file(req: SessionRequest, conversationId: string, id: string) {
    const user = requireUser(req);
    const conversation = await this.repository.findFirstChatConversation({
      where: { id: conversationId, OR: [{ firstUserId: user.id }, { secondUserId: user.id }] },
    });
    if (!conversation) throw new ApiError(404, 'ATTACHMENT_NOT_FOUND', '첨부파일을 찾을 수 없습니다.');
    const file = await this.repository.findFirstChatAttachment({
      include: { object: true },
      where: {
        id,
        conversationId,
        OR: [
          { message: { is: historyWhere(conversation, user.id) } },
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
  async remove(req: SessionRequest, conversationId: string, id: string) {
    const user = requireUser(req);
    const result = await this.repository.deleteManyChatAttachment({
      where: { id, conversationId, uploaderId: user.id, messageId: null },
    });
    if (!result.count) throw new ApiError(404, 'ATTACHMENT_NOT_FOUND', '첨부파일을 찾을 수 없습니다.');
    return { ok: true };
  }
}
