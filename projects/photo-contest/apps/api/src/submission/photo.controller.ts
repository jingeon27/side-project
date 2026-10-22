import { pipeline } from 'node:stream/promises';

import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';

import type { IViewer } from '../auth/session.service';
import { Viewer } from '../auth/viewer.decorator';
import { NO_STORE } from '../common/http/no-store.middleware';
import { mediaContentType, MediaStorage } from '../storage/media-storage.service';
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
    const file = await this.storage.stream(key);
    res.set({
      'Content-Type': mediaContentType(key),
      'Content-Length': String(file.size),
      'Cache-Control': NO_STORE,
      'X-Content-Type-Options': 'nosniff',
    });
    try {
      await pipeline(file.body, res);
    } catch (error) {
      if (!res.destroyed) throw error;
    }
  }
}
