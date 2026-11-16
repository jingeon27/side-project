import { ChatAttachmentSchema, type TChatAttachment } from '@game-feedback/contracts';

import type { Prisma } from '../../generated/prisma';

export const attachmentSelect = {
  id: true,
  conversationId: true,
  name: true,
  mimeType: true,
  size: true,
} as const;
type TAttachmentRow = Prisma.ChatAttachmentGetPayload<{ select: typeof attachmentSelect }>;
export function attachmentDto(row: TAttachmentRow): TChatAttachment {
  return ChatAttachmentSchema.parse({
    id: row.id,
    name: row.name,
    mimeType: row.mimeType,
    size: row.size,
    kind: row.mimeType.startsWith('image/') ? 'IMAGE' : 'VIDEO',
    url: `/api/conversations/${row.conversationId}/attachments/${row.id}`,
  });
}
