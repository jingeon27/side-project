import { Controller, Delete, Get, HttpCode, Inject, Param, Post, Req, Sse, UseGuards } from '@nestjs/common';

import type { SessionRequest } from '../auth/session/session.types';
import { ListQuerySchema, type TListQueryDto } from '../common/http/list-query.dto';
import { ValidatedBody, ValidatedQuery } from '../common/http/request-validation';
import { UserGuard } from '../common/http/session.guard';
import {
  ChatMessageInputSchema,
  ChatReadInputSchema,
  ClearChatHistoryInputSchema,
  ConversationInputSchema,
  type TClearHistoryDto,
  type TCreateConversationDto,
  type TReadMessageDto,
  type TSendMessageDto,
} from './chat-input.dto';
import { ChatConversationService } from './conversation/chat-conversation.service';
import { ChatEvents } from './events/chat.events';
import { ChatHistoryService } from './message/chat-history.service';
import { ChatMessageService } from './message/chat-message.service';

@Controller('api')
export class ChatController {
  constructor(
    @Inject(ChatConversationService) private readonly conversations: ChatConversationService,
    @Inject(ChatMessageService) private readonly messagesService: ChatMessageService,
    @Inject(ChatHistoryService) private readonly history: ChatHistoryService,
    @Inject(ChatEvents) private readonly events: ChatEvents,
  ) {}
  @Get('conversations')
  @UseGuards(UserGuard)
  list(@Req() req: SessionRequest, @ValidatedQuery(ListQuerySchema) query: TListQueryDto) {
    return this.conversations.list(req, query);
  }
  @Post('conversations')
  @HttpCode(200)
  @UseGuards(UserGuard)
  create(@Req() req: SessionRequest, @ValidatedBody(ConversationInputSchema) body: TCreateConversationDto) {
    return this.conversations.create(req, body);
  }
  @Get('conversations/:id/messages')
  @UseGuards(UserGuard)
  messages(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedQuery(ListQuerySchema) query: TListQueryDto,
  ) {
    return this.messagesService.messages(req, id, query);
  }
  @Delete('conversations/:id/messages')
  @UseGuards(UserGuard)
  clearHistory(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(ClearChatHistoryInputSchema) body: TClearHistoryDto,
  ) {
    return this.history.clearHistory(req, id, body);
  }
  @Post('conversations/:id/messages')
  @HttpCode(200)
  @UseGuards(UserGuard)
  send(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(ChatMessageInputSchema) body: TSendMessageDto,
  ) {
    return this.messagesService.send(req, id, body);
  }
  @Post('conversations/:id/read')
  @HttpCode(200)
  @UseGuards(UserGuard)
  read(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(ChatReadInputSchema) body: TReadMessageDto,
  ) {
    return this.history.read(req, id, body);
  }
  @Sse('chat/events')
  stream(@Req() req: SessionRequest) {
    return this.events.stream(req);
  }
}
