import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';
import type { SessionRequest } from '../auth/session.types';
import { requireUser } from '../auth/session-access';
import { ApiError } from '../common/http/api-error';
import { validateChatFile } from './chat-file';
import { attachmentDto, attachmentSelect } from './chat-attachment.presenter';

@Injectable()
export class ChatAttachmentService {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}
  async upload(req: SessionRequest, conversationId: string, input: unknown) {
    const user = requireUser(req);
    const file = validateChatFile(input);
    const attachment = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
      await tx.chatAttachment.deleteMany({
        where: { uploaderId: user.id, messageId: null, createdAt: { lt: new Date(Date.now() - 86400000) } },
      });
      const pending = await tx.chatAttachment.count({ where: { uploaderId: user.id, messageId: null } });
      if (pending >= 4)
        throw new ApiError(409, 'ATTACHMENT_LIMIT', '전송 대기 중인 첨부파일을 먼저 정리해주세요.');
      return tx.chatAttachment.create({
        data: { conversationId, uploaderId: user.id, ...file, bytes: Uint8Array.from(file.bytes) },
        select: attachmentSelect,
      });
    });
    return attachmentDto(attachment);
  }
  async file(req: SessionRequest, conversationId: string, id: string) {
    const user = requireUser(req);
    const file = await this.db.chatAttachment.findFirst({
      where: { id, conversationId, OR: [{ messageId: { not: null } }, { uploaderId: user.id }] },
    });
    if (!file) throw new ApiError(404, 'ATTACHMENT_NOT_FOUND', '첨부파일을 찾을 수 없습니다.');
    return file;
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
