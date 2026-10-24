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
  UploadedFile,
  UseGuards,
  UseInterceptors,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { ValidatedBody } from '../common/http/request-validation';
import { MediaUploadDto } from '../common/media-upload.dto';
import { MediaWorkInterceptor, ProxyUploadGuard } from '../media-storage/media-work';
import { ChatAccessService } from './chat-access.service';
import { ChatAttachmentUploadService } from './chat-attachment-upload.service';
import { ChatAttachmentService } from './chat-attachment.service';
import { CHAT_FILE_LIMIT, mediaRange } from './chat-file';

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
    @ValidatedBody(MediaUploadDto) input: MediaUploadDto,
  ) {
    return this.uploads.request(req, id, input);
  }
  @Post(':attachmentId/complete')
  @HttpCode(200)
  complete(@Req() req: SessionRequest, @Param('id') id: string, @Param('attachmentId') attachmentId: string) {
    return this.uploads.complete(req, id, attachmentId);
  }
  @Post()
  @HttpCode(200)
  @UseGuards(ProxyUploadGuard)
  @UseInterceptors(
    MediaWorkInterceptor,
    FileInterceptor('file', { limits: { fileSize: CHAT_FILE_LIMIT, files: 1, fields: 0 } }),
  )
  upload(@Req() req: SessionRequest, @Param('id') id: string, @UploadedFile() file: unknown) {
    return this.attachments.upload(req, id, file);
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
    const file = await this.attachments.file(req, id, attachmentId);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    const range = mediaRange(req.headers.range, file.size);
    if (!range) {
      res.setHeader('Content-Range', `bytes */${file.size}`);
      res.status(416).end();
      return;
    }
    if (req.method === 'HEAD') {
      res.setHeader('Content-Length', file.size);
      res.end();
      return;
    }
    const location = await this.attachments.location(
      file,
      file.mimeType,
      `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    if (location) {
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.redirect(307, location);
      return;
    }
    const bytes = await this.attachments.content(file, range);
    if (range.partial) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${file.size}`);
    }
    res.setHeader('Content-Length', range.end - range.start + 1);
    res.send(bytes);
  }
}
