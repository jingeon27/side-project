import { UseGuards, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { UserGuard } from '../common/http/session.guard';
import { StartSupportDto } from './support-input.dto';
import { ValidatedBody } from '../common/http/request-validation';
import type { SessionRequest } from '../auth/session.types';
import { SupportService } from './support.service';
@Controller('api')
export class SupportController {
  constructor(@Inject(SupportService) private readonly service: SupportService) {}
  @Post('support/conversations')
  @HttpCode(200)
  @UseGuards(UserGuard)
  start(@Req() req: SessionRequest, @ValidatedBody(StartSupportDto) body: StartSupportDto) {
    return this.service.start(req, body);
  }
}
