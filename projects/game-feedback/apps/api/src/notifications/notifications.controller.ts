import { Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import type { SessionRequest } from '../auth/session.types';
import { NotificationsService } from './notifications.service';

@Controller('api')
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly service: NotificationsService) {}
  @Get('notifications') notifications(@Req() req: SessionRequest) {
    return this.service.notifications(req);
  }
  @HttpCode(200) @Post('notifications/read-all') readAll(@Req() req: SessionRequest) {
    return this.service.readNotification(req);
  }
  @HttpCode(200) @Post('notifications/:id/read') readOne(
    @Req() req: SessionRequest,
    @Param('id') id: string,
  ) {
    return this.service.readNotification(req, id);
  }
}
