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

import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { ValidatedBody } from '../common/http/request-validation';
import { mediaRange } from '../common/media-file';
import { MediaUploadInputSchema, type TMediaUploadDto } from '../common/media-upload.dto';
import { PostMediaUploadService } from './post-media-upload.service';
import { PostMediaService } from './post-media.service';

@Injectable()
export class PostMediaUploadGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    requireUser(context.switchToHttp().getRequest<SessionRequest>());
    return true;
  }
}

@Controller('api/post-media')
export class PostMediaController {
  constructor(
    @Inject(PostMediaService) private readonly media: PostMediaService,
    @Inject(PostMediaUploadService) private readonly uploads: PostMediaUploadService,
  ) {}
  @Post('uploads')
  @HttpCode(200)
  @UseGuards(PostMediaUploadGuard)
  request(@Req() req: SessionRequest, @ValidatedBody(MediaUploadInputSchema) input: TMediaUploadDto) {
    return this.uploads.request(req, input);
  }
  @Post(':id/complete')
  @HttpCode(200)
  @UseGuards(PostMediaUploadGuard)
  complete(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.uploads.complete(req, id);
  }
  @Delete(':id')
  remove(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.media.remove(req, id);
  }
  @Get(':id')
  async file(@Req() req: SessionRequest, @Param('id') id: string, @Res() res: Response) {
    const file = await this.media.file(req, id);
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
    const location = await this.media.location(
      file,
      file.mimeType,
      `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.redirect(307, location);
  }
}
