import type { z } from 'zod';

import {
  ChatMessageInputSchema,
  ChatReadInputSchema,
  ClearChatHistoryInputSchema,
  ConversationInputSchema,
} from '@game-feedback/contracts';

export { ConversationInputSchema, ChatMessageInputSchema, ClearChatHistoryInputSchema, ChatReadInputSchema };

export type TCreateConversationDto = z.output<typeof ConversationInputSchema>;
export type TSendMessageDto = z.output<typeof ChatMessageInputSchema>;
export type TClearHistoryDto = z.output<typeof ClearChatHistoryInputSchema>;
export type TReadMessageDto = z.output<typeof ChatReadInputSchema>;
