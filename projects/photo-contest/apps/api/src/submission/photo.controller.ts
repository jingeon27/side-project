import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';

import type { IViewer } from '../auth/session.service';
import { Viewer } from '../auth/viewer.decorator';
import { NO_STORE } from '../common/http/no-store.middleware';
import { SubmissionService } from './submission.service';

@Controller('photos')
export class PhotoController {
  constructor(private readonly submissionService: SubmissionService) {}

  @Get(':id')
  async photo(@Viewer() viewer: IViewer, @Param('id') id: string, @Res() res: Response) {
    const file = await this.submissionService.photoFile(viewer, id);
    res
      .set({ 'Content-Type': 'image/webp', 'Cache-Control': NO_STORE, 'X-Content-Type-Options': 'nosniff' })
      .send(file);
  }
}
