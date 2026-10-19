import { ValidatedQuery, ValidatedBody } from '../common/http/request-validation';
import { ListQueryDto } from '../common/http/list-query.dto';
import { UseGuards, Controller, Delete, Get, HttpCode, Inject, Param, Post, Req, Sse } from '@nestjs/common';
import { UserGuard } from '../common/http/session.guard';
import { ReadMessageDto, ClearHistoryDto, SendMessageDto, CreateConversationDto } from './chat-input.dto';
import { ChatService } from './chat.service';
import { ChatEvents } from './chat.events';
import type { SessionRequest } from '../auth/session.types';

@Controller('api')
export class ChatController {
  constructor(
    @Inject(ChatService) private readonly chat: ChatService,
    @Inject(ChatEvents) private readonly events: ChatEvents,
  ) {}
  @Get('conversations')
  @UseGuards(UserGuard)
  list(@Req() req: SessionRequest, @ValidatedQuery(ListQueryDto) query: ListQueryDto) {
    return this.chat.list(req, query);
  }
  @Post('conversations')
  @HttpCode(200)
  @UseGuards(UserGuard)
  create(@Req() req: SessionRequest, @ValidatedBody(CreateConversationDto) body: CreateConversationDto) {
    return this.chat.create(req, body);
  }
  @Get('conversations/:id/messages')
  @UseGuards(UserGuard)
  messages(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedQuery(ListQueryDto) query: ListQueryDto,
  ) {
    return this.chat.messages(req, id, query);
  }
  @Delete('conversations/:id/messages')
  @UseGuards(UserGuard)
  clearHistory(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(ClearHistoryDto) body: ClearHistoryDto,
  ) {
    return this.chat.clearHistory(req, id, body);
  }
  @Post('conversations/:id/messages')
  @HttpCode(200)
  @UseGuards(UserGuard)
  send(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(SendMessageDto) body: SendMessageDto,
  ) {
    return this.chat.send(req, id, body);
  }
  @Post('conversations/:id/read')
  @HttpCode(200)
  @UseGuards(UserGuard)
  read(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(ReadMessageDto) body: ReadMessageDto,
  ) {
    return this.chat.read(req, id, body);
  }
  @Sse('chat/events')
  stream(@Req() req: SessionRequest) {
    return this.events.stream(req);
  }
}
