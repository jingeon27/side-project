import { Inject, Injectable } from '@nestjs/common';
import type { Response } from 'express';

import { lockActiveUser } from '../../auth/account/user-write';
import { requireUser } from '../../auth/session/session-access';
import type { SessionRequest } from '../../auth/session/session.types';
import { ApiError } from '../../common/http/api-error';
import { mediaRange } from '../../common/media-file';
import { UnitOfWork } from '../../database/unit-of-work';
import { PrismaClient, type MediaObject } from '../../generated/prisma';
import { MediaStorage } from '../../media-storage/media-storage.service';
import { historyWhere } from '../message/chat-history';
import { attachmentSelect } from './chat-attachment.presenter';

@Injectable()
export class ChatAttachmentService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(MediaStorage) private readonly storage: MediaStorage,
  ) {}
  async register(
    userId: string,
    conversationId: string,
    metadata: { name: string; mimeType: string; size: number },
    stored: Pick<MediaObject, 'backend' | 'key'>,
  ) {
    return this.transactions.run(async (tx) => {
      const support = await tx.supportConversation.findUnique({
        where: { conversationId },
        select: { id: true },
      });
      await lockActiveUser({ client: tx, userId, allowBanned: !!support });
      await tx.chatAttachment.deleteMany({
        where: { uploaderId: userId, messageId: null, createdAt: { lt: new Date(Date.now() - 86400000) } },
      });
      const pending = await tx.chatAttachment.count({
        where: { uploaderId: userId, messageId: null },
      });
      if (pending >= 4)
        throw new ApiError(409, 'ATTACHMENT_LIMIT', '전송 대기 중인 첨부파일을 먼저 정리해주세요.');
      const object = await tx.mediaObject.create({ data: stored, select: { id: true } });
      return tx.chatAttachment.create({
        data: {
          conversationId,
          uploaderId: userId,
          ...metadata,
          bytes: null,
          objectId: object.id,
          uploadedAt: null,
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
  async download(req: SessionRequest, id: string, attachmentId: string, res: Response) {
    const file = await this.file(req, id, attachmentId);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    const range = mediaRange(req.headers.range, file.size);
    if (!range) {
      res.setHeader('Content-Range', `bytes */${file.size}`);
      res.status(416).end();
      return;
    }
    if (req.method === 'HEAD') {
      res.setHeader('Content-Length', file.size);
      res.end();
      return;
    }
    const location = await this.location(
      file,
      file.mimeType,
      `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.redirect(307, location);
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
