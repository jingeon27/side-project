import { UseGuards, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { UserGuard } from '../common/http/session.guard';
import { CreateReportDto } from './report-input.dto';
import { ValidatedBody } from '../common/http/request-validation';
import type { SessionRequest } from '../auth/session.types';
import { ModerationService } from './moderation.service';

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
