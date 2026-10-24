import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';

import type { IViewer } from '../auth/session.service';
import { OptionalViewer } from '../auth/viewer.decorator';
import { redirectToStorage } from '../common/http/storage-redirect';
import { MediaStorage } from '../storage/media-storage.service';
import { mediaDownloadDisposition } from './media-download.policy';
import { PostService } from './post.service';

@Controller()
export class PostController {
  constructor(
    private readonly posts: PostService,
    private readonly storage: MediaStorage,
  ) {}
  @Get('media/:id')
  async media(@OptionalViewer() viewer: IViewer | null, @Param('id') id: string, @Res() res: Response) {
    const file = await this.posts.file(viewer, id);
    redirectToStorage(res, await this.storage.presignRead(file.key));
  }

  @Get('media/:id/download')
  async download(@OptionalViewer() viewer: IViewer | null, @Param('id') id: string, @Res() res: Response) {
    const file = await this.posts.file(viewer, id);
    redirectToStorage(res, await this.storage.presignRead(file.key, mediaDownloadDisposition(file.filename)));
  }
}
