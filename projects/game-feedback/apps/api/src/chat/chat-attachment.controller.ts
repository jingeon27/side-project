import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Response } from 'express';

import { requireUser } from '../auth/session/session-access';
import type { SessionRequest } from '../auth/session/session.types';
import { ValidatedBody } from '../common/http/request-validation';
import { MediaUploadInputSchema, type TMediaUploadDto } from '../common/media-upload.dto';
import { ChatAccessService } from './chat-access.service';
import { ChatAttachmentUploadService } from './chat-attachment-upload.service';
import { ChatAttachmentService } from './chat-attachment.service';

@Injectable()
export class ChatAttachmentGuard implements CanActivate {
  constructor(@Inject(ChatAccessService) private readonly chat: ChatAccessService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<SessionRequest>();
    await this.chat.visible(requireUser(req).id, String(req.params.id));
    return true;
  }
}
@Controller('api/conversations/:id/attachments')
@UseGuards(ChatAttachmentGuard)
export class ChatAttachmentController {
  constructor(
    @Inject(ChatAttachmentService) private readonly attachments: ChatAttachmentService,
    @Inject(ChatAttachmentUploadService) private readonly uploads: ChatAttachmentUploadService,
  ) {}
  @Post('uploads')
  @HttpCode(200)
  request(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(MediaUploadInputSchema) input: TMediaUploadDto,
  ) {
    return this.uploads.request(req, id, input);
  }
  @Post(':attachmentId/complete')
  @HttpCode(200)
  complete(@Req() req: SessionRequest, @Param('id') id: string, @Param('attachmentId') attachmentId: string) {
    return this.uploads.complete(req, id, attachmentId);
  }
  @Delete(':attachmentId')
  remove(@Req() req: SessionRequest, @Param('id') id: string, @Param('attachmentId') attachmentId: string) {
    return this.attachments.remove(req, id, attachmentId);
  }
  @Get(':attachmentId')
  async download(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    return this.attachments.download(req, id, attachmentId, res);
  }
}
