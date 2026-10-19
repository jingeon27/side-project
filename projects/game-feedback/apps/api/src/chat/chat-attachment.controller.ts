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
import type { SessionRequest } from '../auth/session.types';
import { requireUser } from '../auth/session-access';
import { ChatService } from './chat.service';
import { ChatAttachmentService } from './chat-attachment.service';
import { CHAT_FILE_LIMIT, mediaRange } from './chat-file';

@Injectable()
export class ChatAttachmentGuard implements CanActivate {
  constructor(@Inject(ChatService) private readonly chat: ChatService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<SessionRequest>();
    await this.chat.visible(requireUser(req).id, String(req.params.id));
    return true;
  }
}
@Controller('api/conversations/:id/attachments')
@UseGuards(ChatAttachmentGuard)
export class ChatAttachmentController {
  constructor(@Inject(ChatAttachmentService) private readonly attachments: ChatAttachmentService) {}
  @Post()
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CHAT_FILE_LIMIT, files: 1, fields: 0 } }))
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
    const bytes = await this.attachments.content(file, range);
    if (range.partial) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${file.size}`);
    }
    res.setHeader('Content-Length', range.end - range.start + 1);
    res.send(bytes);
  }
}
