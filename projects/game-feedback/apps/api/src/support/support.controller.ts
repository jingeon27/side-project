import { Controller, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';

import type { SessionRequest } from '../auth/session.types';
import { ValidatedBody } from '../common/http/request-validation';
import { UserGuard } from '../common/http/session.guard';
import { SupportInputSchema, type TStartSupportDto } from './support-input.dto';
import { SupportService } from './support.service';

@Controller('api')
export class SupportController {
  constructor(@Inject(SupportService) private readonly service: SupportService) {}
  @Post('support/conversations')
  @HttpCode(200)
  @UseGuards(UserGuard)
  start(@Req() req: SessionRequest, @ValidatedBody(SupportInputSchema) body: TStartSupportDto) {
    return this.service.start(req, body);
  }
}
