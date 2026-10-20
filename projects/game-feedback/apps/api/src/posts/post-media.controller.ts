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
  UseInterceptors,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { SessionRequest } from '../auth/session.types';
import { MEDIA_FILE_LIMIT, mediaRange } from '../common/media-file';
import { PostMediaService } from './post-media.service';
import { requireUser } from '../auth/session-access';
import { ValidatedBody } from '../common/http/request-validation';
import { MediaUploadDto } from '../common/media-upload.dto';
import { PostMediaUploadService } from './post-media-upload.service';

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
  request(@Req() req: SessionRequest, @ValidatedBody(MediaUploadDto) input: MediaUploadDto) {
    return this.uploads.request(req, input);
  }
  @Post(':id/complete')
  @HttpCode(200)
  @UseGuards(PostMediaUploadGuard)
  complete(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.uploads.complete(req, id);
  }
  @Post()
  @HttpCode(200)
  @UseGuards(PostMediaUploadGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MEDIA_FILE_LIMIT, files: 1, fields: 0 } }))
  upload(@Req() req: SessionRequest, @UploadedFile() file: unknown) {
    return this.media.upload(req, file);
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
    if (location) {
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.redirect(307, location);
      return;
    }
    const bytes = await this.media.content(file, range);
    if (range.partial) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${file.size}`);
    }
    res.setHeader('Content-Length', range.end - range.start + 1);
    res.send(bytes);
  }
}
