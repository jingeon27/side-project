import { Controller, Get, HttpCode, Inject, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import type { SessionRequest } from '../../auth/session.types';
import { ChatMessageInputSchema, type TSendMessageDto } from '../../chat/chat-input.dto';
import { ListQuerySchema, type TListQueryDto } from '../../common/http/list-query.dto';
import { ValidatedBody, ValidatedQuery } from '../../common/http/request-validation';
import { AdminGuard } from '../../common/http/session.guard';
import { AdminSupportService } from './admin-support.service';
import { SupportStatusInputSchema, type TSupportStatusDto } from './support-input.dto';

@UseGuards(AdminGuard)
@Controller('api/admin/support')
export class AdminSupportController {
  constructor(@Inject(AdminSupportService) private readonly support: AdminSupportService) {}
  @Get()
  list(@Req() req: SessionRequest) {
    return this.support.list(req);
  }
  @Get(':id/messages')
  messages(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedQuery(ListQuerySchema) query: TListQueryDto,
  ) {
    return this.support.messages(req, id, query);
  }
  @Get(':id/attachments/:attachmentId')
  download(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    return this.support.download(req, id, attachmentId, res);
  }
  @Post(':id/messages')
  @HttpCode(200)
  send(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(ChatMessageInputSchema) body: TSendMessageDto,
  ) {
    return this.support.send(req, id, body);
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
