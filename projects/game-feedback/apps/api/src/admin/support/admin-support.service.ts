import { Inject, Injectable } from '@nestjs/common';
import type { Response } from 'express';

import { requireAdmin } from '../../auth/session-access';
import type { SessionRequest } from '../../auth/session.types';
import { ChatAttachmentService } from '../../chat/chat-attachment.service';
import { type TSendMessageDto } from '../../chat/chat-input.dto';
import { ChatMessageService } from '../../chat/chat-message.service';
import { ApiError } from '../../common/http/api-error';
import { type TListQueryDto } from '../../common/http/list-query.dto';
import { UnitOfWork } from '../../database/unit-of-work';
import { PrismaClient, type Prisma } from '../../generated/prisma';
import { authorDto, authorSelect } from '../../users/user.presenter';
import { type TSupportStatusDto } from './support-input.dto';

const include = {
  requester: { select: authorSelect },
  conversation: { select: { updatedAt: true } },
} as const;
// 기록 경계 같은 내부 열은 응답에 싣지 않는다.
function supportThread(row: Prisma.SupportConversationGetPayload<{ include: typeof include }>) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    requester: authorDto(row.requester),
    adminId: row.adminId,
    topic: row.topic,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.conversation.updatedAt.toISOString(),
  };
}
@Injectable()
export class AdminSupportService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(ChatAttachmentService) private readonly attachments: ChatAttachmentService,
    @Inject(ChatMessageService) private readonly chat: ChatMessageService,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
  ) {}
  private async requireThread(req: SessionRequest, conversationId: string) {
    const admin = requireAdmin(req);
    const thread = await this.db.supportConversation.findFirst({
      where: { conversationId, adminId: admin.id },
    });
    if (!thread) throw new ApiError(404, 'SUPPORT_NOT_FOUND', '문의를 찾을 수 없습니다.');
  }
  async messages(req: SessionRequest, id: string, query: TListQueryDto) {
    await this.requireThread(req, id);
    const messages = await this.chat.messages(req, id, query);
    return {
      ...messages,
      items: messages.items.map((message) => ({
        ...message,
        attachments: message.attachments?.map((file) => ({
          ...file,
          url: `/api/admin/support/${encodeURIComponent(id)}/attachments/${encodeURIComponent(file.id)}`,
        })),
      })),
    };
  }
  async download(req: SessionRequest, id: string, attachmentId: string, res: Response) {
    await this.requireThread(req, id);
    return this.attachments.download(req, id, attachmentId, res);
  }
  async send(req: SessionRequest, id: string, body: TSendMessageDto) {
    await this.requireThread(req, id);
    return this.chat.send(req, id, body);
  }
  async list(req: SessionRequest) {
    const admin = requireAdmin(req);
    const rows = await this.db.supportConversation.findMany({
      where: { adminId: admin.id },
      include,
      orderBy: { conversation: { updatedAt: 'desc' } },
      take: 100,
    });
    return rows.map(supportThread);
  }
  async status(req: SessionRequest, id: string, body: TSupportStatusDto) {
    const admin = requireAdmin(req);
    const { status } = body;
    const row = await this.transactions.run(async (tx) => {
      const thread = await (tx ?? this.db).supportConversation.findFirst({
        where: { id, adminId: admin.id },
      });
      if (!thread) throw new ApiError(404, 'SUPPORT_NOT_FOUND', '문의를 찾을 수 없습니다.');
      const updated = await (tx ?? this.db).supportConversation.update({
        where: { id },
        data: { status },
        include,
      });
      await (tx ?? this.db).auditLog.create({
        data: {
          actorId: admin.id,
          action: `SUPPORT_${status}`,
          targetType: 'SUPPORT',
          targetId: id,
          detail: '\uBB38\uC758 \uCC98\uB9AC \uC0C1\uD0DC \uBCC0\uACBD',
        },
      });
      return updated;
    });
    return supportThread(row);
  }
}
