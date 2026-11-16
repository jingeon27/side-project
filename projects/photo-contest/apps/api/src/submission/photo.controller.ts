import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';

import type { IViewer } from '../auth/session/session.service';
import { Viewer } from '../auth/session/viewer.decorator';
import { redirectToStorage } from '../common/http/storage-redirect';
import { MediaStorage } from '../storage/media-storage.service';
import { SubmissionService } from './submission.service';

@Controller('photos')
export class PhotoController {
  constructor(
    private readonly submissionService: SubmissionService,
    private readonly storage: MediaStorage,
  ) {}

  @Get(':id')
  async photo(@Viewer() viewer: IViewer, @Param('id') id: string, @Res() res: Response) {
    const key = await this.submissionService.photoKey(viewer, id);
    redirectToStorage(res, await this.storage.presignRead(key));
  }
}
