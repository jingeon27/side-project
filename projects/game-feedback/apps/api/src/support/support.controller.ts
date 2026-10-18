import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import type { SessionRequest } from '../auth/session.types';
import { SupportService } from './support.service';
@Controller('api')
export class SupportController {
  constructor(@Inject(SupportService) private readonly service: SupportService) {}
  @Post('support/conversations')
  @HttpCode(200)
  start(@Req() req: SessionRequest, @Body() body: unknown) {
    return this.service.start(req, body);
  }
  @Get('admin/support')
  list(@Req() req: SessionRequest) {
    return this.service.list(req);
  }
  @Patch('admin/support/:id')
  status(@Req() req: SessionRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.status(req, id, body);
  }
}
