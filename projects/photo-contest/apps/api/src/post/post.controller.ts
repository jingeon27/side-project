import { pipeline } from 'node:stream/promises';

import { Body, Controller, Get, Headers, HttpCode, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';

import type { IViewer } from '../auth/session.service';
import { OptionalViewer, Viewer } from '../auth/viewer.decorator';
import { NO_STORE } from '../common/http/no-store.middleware';
import { MediaStorage } from '../storage/media-storage.service';
import { mediaDownloadDisposition } from './media-download.policy';
import { mediaRange } from './media-range';
import { PostService } from './post.service';

@Controller()
export class PostController {
  constructor(
    private readonly posts: PostService,
    private readonly storage: MediaStorage,
  ) {}
  @Post('post-uploads/:token')
  @HttpCode(201)
  async upload(
    @Viewer() viewer: IViewer,
    @Param('token') token: string,
    @Body() body: unknown,
    @Headers('content-type') type: string,
  ) {
    await this.posts.upload(viewer, token, body, type ?? '');
    return { uploaded: true };
  }
  @Get('media/:id')
  async media(
    @OptionalViewer() viewer: IViewer | null,
    @Param('id') id: string,
    @Headers('range') header: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.posts.file(viewer, id);
    await this.sendFile(file, header, res);
  }

  @Get('media/:id/download')
  async download(
    @OptionalViewer() viewer: IViewer | null,
    @Param('id') id: string,
    @Headers('range') header: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.posts.file(viewer, id);
    res.set('Content-Disposition', mediaDownloadDisposition(file.filename));
    await this.sendFile(file, header, res);
  }

  private async sendFile(
    file: Awaited<ReturnType<PostService['file']>>,
    header: string | undefined,
    res: Response,
  ) {
    res.set({
      'Content-Type': file.contentType,
      'Cache-Control': NO_STORE,
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
    });
    // 이관된 옛 사진은 크기 정보가 없어 저장소 응답을 그대로 스트리밍한다.
    const range = header && file.size > 0 ? mediaRange(header, file.size) : undefined;
    if (range === null) {
      res.status(416).set('Content-Range', `bytes */${file.size}`).end();
      return;
    }
    const stream = await this.storage.stream(file.key, range);
    if (range)
      res.status(206).set({
        'Content-Range': `bytes ${range.start}-${range.end}/${file.size}`,
        'Content-Length': String(range.end - range.start + 1),
      });
    if (!range) res.set('Content-Length', String(stream.size));
    try {
      await pipeline(stream.body, res);
    } catch (error) {
      if (!res.destroyed) throw error;
    }
  }
}
