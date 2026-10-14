import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import type { IViewer } from '../auth/session.service';
import { Viewer } from '../auth/viewer.decorator';
import { SubmissionService } from './submission.service';

/** 원본 사진 본문은 bootstrap에서 /uploads 경로에만 raw parser로 받는다. */
@Controller('uploads')
export class UploadController {
  constructor(private readonly submissionService: SubmissionService) {}

  @Post(':token')
  @HttpCode(HttpStatus.CREATED)
  async upload(@Viewer() viewer: IViewer, @Param('token') token: string, @Body() body: unknown) {
    await this.submissionService.upload(viewer, token, body);
    return { uploaded: true };
  }
}
