import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatEvents } from './chat.events';
import { ChatService } from './chat.service';
import { ChatLifecycleMiddleware } from './chat-lifecycle.middleware';
import { ChatAttachmentController, ChatAttachmentGuard } from './chat-attachment.controller';
import { ChatAttachmentService } from './chat-attachment.service';

@Module({
  controllers: [ChatController, ChatAttachmentController],
  providers: [ChatService, ChatEvents, ChatLifecycleMiddleware, ChatAttachmentService, ChatAttachmentGuard],
  exports: [ChatEvents, ChatLifecycleMiddleware, ChatService],
})
export class ChatModule {}
