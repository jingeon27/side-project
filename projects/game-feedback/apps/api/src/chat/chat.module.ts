import { Module } from '@nestjs/common';

import { ChatAccessService } from './chat-access.service';
import { ChatAttachmentUploadService } from './chat-attachment-upload.service';
import { ChatAttachmentController, ChatAttachmentGuard } from './chat-attachment.controller';
import { ChatAttachmentService } from './chat-attachment.service';
import { ChatConversationService } from './chat-conversation.service';
import { ChatHistoryService } from './chat-history.service';
import { ChatLifecycleMiddleware } from './chat-lifecycle.middleware';
import { ChatMessageService } from './chat-message.service';
import { ChatController } from './chat.controller';
import { ChatEvents } from './chat.events';

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
  exports: [ChatEvents, ChatLifecycleMiddleware, ChatAccessService, ChatConversationService],
})
export class ChatModule {}
