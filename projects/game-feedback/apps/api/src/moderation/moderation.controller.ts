import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import type { SessionRequest } from '../auth/session.types';
import { ModerationService } from './moderation.service';

@Controller('api')
export class ModerationController {
  constructor(@Inject(ModerationService) private readonly moderation: ModerationService) {}

  @HttpCode(200)
  @Post('reports')
  report(@Req() req: SessionRequest, @Body() body: unknown) {
    return this.moderation.report(req, body);
  }

  @HttpCode(200)
  @Post('admin/hide')
  hide(@Req() req: SessionRequest, @Body() body: unknown) {
    return this.moderation.hide(req, body);
  }

  @Get('admin/reports')
  reports(@Req() req: SessionRequest) {
    return this.moderation.reports(req);
  }
  @Patch('admin/reports/:id')
  review(@Req() req: SessionRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.moderation.review(req, id, body);
  }
  @Get('admin/users/:id')
  user(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.moderation.user(req, id);
  }
  @Patch('admin/users/:id/ban')
  ban(@Req() req: SessionRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.moderation.ban(req, id, body);
  }
}
