import { Controller, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';

import type { SessionRequest } from '../auth/session.types';
import { ValidatedBody } from '../common/http/request-validation';
import { UserGuard } from '../common/http/session.guard';
import { ModerationService } from './moderation.service';
import { CreateReportDto } from './report-input.dto';

@Controller('api')
export class ModerationController {
  constructor(@Inject(ModerationService) private readonly moderation: ModerationService) {}

  @HttpCode(200)
  @Post('reports')
  @UseGuards(UserGuard)
  report(@Req() req: SessionRequest, @ValidatedBody(CreateReportDto) body: CreateReportDto) {
    return this.moderation.report(req, body);
  }
}
