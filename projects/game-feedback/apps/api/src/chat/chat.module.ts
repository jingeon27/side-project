import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatEvents } from './chat.events';
import { ChatService } from './chat.service';
import { ChatLifecycleMiddleware } from './chat-lifecycle.middleware';

@Module({
  controllers: [ChatController],
  providers: [ChatService, ChatEvents, ChatLifecycleMiddleware],
  exports: [ChatEvents, ChatLifecycleMiddleware],
})
export class ChatModule {}
