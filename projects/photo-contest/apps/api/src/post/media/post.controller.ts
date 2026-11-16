import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';

import type { IViewer } from '../../auth/session/session.service';
import { OptionalViewer } from '../../auth/session/viewer.decorator';
import { redirectToStorage } from '../../common/http/storage-redirect';
import { PostFileService } from './post-file.service';

@Controller()
export class PostController {
  constructor(private readonly files: PostFileService) {}
  @Get('media/:id')
  async media(@OptionalViewer() viewer: IViewer | null, @Param('id') id: string, @Res() res: Response) {
    redirectToStorage(res, await this.files.read(viewer, id));
  }

  @Get('media/:id/download')
  async download(@OptionalViewer() viewer: IViewer | null, @Param('id') id: string, @Res() res: Response) {
    const file = await this.files.download(viewer, id);
    redirectToStorage(res, file.url);
  }
}
