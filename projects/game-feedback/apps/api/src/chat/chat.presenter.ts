import { type ChatMessage } from '@game-feedback/contracts';
import { type Prisma } from '../generated/prisma';
import { authorDto, authorSelect } from '../users/user.presenter';
import { attachmentDto, attachmentSelect } from './chat-attachment.presenter';
export const userSelect = { ...authorSelect, bannedAt: true };
export const conversationInclude = {
  firstUser: { select: userSelect },
  secondUser: { select: userSelect },
  support: true,
} as const;
export const messageInclude = {
  sender: { select: authorSelect },
  attachments: { select: attachmentSelect, orderBy: { createdAt: 'asc' } },
} as const;
export type ConversationRow = Prisma.ChatConversationGetPayload<{ include: typeof conversationInclude }>;
export type MessageRow = Prisma.ChatMessageGetPayload<{ include: typeof messageInclude }>;
export function messageDto(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    sender: authorDto(row.sender),
    body: row.body,
    attachments: row.attachments.map(attachmentDto),
    createdAt: row.createdAt.toISOString(),
    clientMessageId: row.clientMessageId,
  };
}
