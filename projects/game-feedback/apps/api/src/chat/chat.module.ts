import { Module } from '@nestjs/common';

import { ChatAttachmentUploadService } from './attachment/chat-attachment-upload.service';
import { ChatAttachmentController, ChatAttachmentGuard } from './attachment/chat-attachment.controller';
import { ChatAttachmentService } from './attachment/chat-attachment.service';
import { ChatController } from './chat.controller';
import { ChatAccessService } from './conversation/chat-access.service';
import { ChatConversationService } from './conversation/chat-conversation.service';
import { ChatLifecycleMiddleware } from './events/chat-lifecycle.middleware';
import { ChatEvents } from './events/chat.events';
import { ChatHistoryService } from './message/chat-history.service';
import { ChatMessageService } from './message/chat-message.service';

@Module({
  controllers: [ChatController, ChatAttachmentController],
  providers: [
    ChatAccessService,
    ChatConversationService,
    ChatMessageService,
    ChatHistoryService,
    ChatEvents,
    ChatLifecycleMiddleware,
    ChatAttachmentService,
    ChatAttachmentUploadService,
    ChatAttachmentGuard,
  ],
  exports: [
    ChatAttachmentService,
    ChatMessageService,
    ChatEvents,
    ChatLifecycleMiddleware,
    ChatAccessService,
    ChatConversationService,
  ],
})
export class ChatModule {}
