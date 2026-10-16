import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req, Sse } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatEvents } from './chat.events';
import type { SessionRequest } from './service';

@Controller('api')
export class ChatController {
  constructor(
    @Inject(ChatService) private readonly chat: ChatService,
    @Inject(ChatEvents) private readonly events: ChatEvents,
  ) {}
  @Get('conversations')
  list(@Req() req: SessionRequest) {
    return this.chat.list(req);
  }
  @Post('conversations')
  @HttpCode(200)
  create(@Req() req: SessionRequest, @Body() body: unknown) {
    return this.chat.create(req, body);
  }
  @Get('conversations/:id/messages')
  messages(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.chat.messages(req, id);
  }
  @Post('conversations/:id/messages')
  @HttpCode(200)
  send(@Req() req: SessionRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.chat.send(req, id, body);
  }
  @Post('conversations/:id/read')
  @HttpCode(200)
  read(@Req() req: SessionRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.chat.read(req, id, body);
  }
  @Sse('chat/events')
  stream(@Req() req: SessionRequest) {
    return this.events.stream(req);
  }
}
