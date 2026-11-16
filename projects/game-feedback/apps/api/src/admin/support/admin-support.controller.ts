import { Controller, Get, HttpCode, Inject, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import type { SessionRequest } from '../../auth/session/session.types';
import { ChatMessageInputSchema, type TSendMessageDto } from '../../chat/chat-input.dto';
import { ListQuerySchema, type TListQueryDto } from '../../common/http/list-query.dto';
import { ValidatedBody, ValidatedQuery } from '../../common/http/request-validation';
import { AdminGuard } from '../../common/http/session.guard';
import { AdminSupportService } from './admin-support.service';
import {
  AdminSupportListQuerySchema,
  SupportStatusInputSchema,
  type TAdminSupportListQueryDto,
  type TSupportStatusDto,
} from './support-input.dto';

@UseGuards(AdminGuard)
@Controller('api/admin/support')
export class AdminSupportController {
  constructor(@Inject(AdminSupportService) private readonly support: AdminSupportService) {}
  @Get()
  list(
    @Req() req: SessionRequest,
    @ValidatedQuery(AdminSupportListQuerySchema) query: TAdminSupportListQueryDto,
  ) {
    return this.support.list(req, query);
  }
  @Get(':id')
  thread(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.support.thread(req, id);
  }
  // 메시지·첨부 경로는 문의 id가 아니라 대화 id를 받는다.
  @Get(':conversationId/messages')
  messages(
    @Req() req: SessionRequest,
    @Param('conversationId') conversationId: string,
    @ValidatedQuery(ListQuerySchema) query: TListQueryDto,
  ) {
    return this.support.messages(req, conversationId, query);
  }
  @Get(':conversationId/attachments/:attachmentId')
  download(
    @Req() req: SessionRequest,
    @Param('conversationId') conversationId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    return this.support.download(req, conversationId, attachmentId, res);
  }
  @Post(':conversationId/messages')
  @HttpCode(200)
  send(
    @Req() req: SessionRequest,
    @Param('conversationId') conversationId: string,
    @ValidatedBody(ChatMessageInputSchema) body: TSendMessageDto,
  ) {
    return this.support.send(req, conversationId, body);
  }
  @Patch(':id')
  status(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(SupportStatusInputSchema) body: TSupportStatusDto,
  ) {
    return this.support.status(req, id, body);
  }
}
