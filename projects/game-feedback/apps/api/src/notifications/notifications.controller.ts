import { Controller, Get, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';

import type { SessionRequest } from '../auth/session.types';
import { ListQueryDto } from '../common/http/list-query.dto';
import { ValidatedQuery } from '../common/http/request-validation';
import { UserGuard } from '../common/http/session.guard';
import { NotificationsService } from './notifications.service';

@Controller('api')
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly service: NotificationsService) {}
  @Get('notifications')
  @UseGuards(UserGuard)
  notifications(@Req() req: SessionRequest, @ValidatedQuery(ListQueryDto) query: ListQueryDto) {
    return this.service.notifications(req, query);
  }
  @HttpCode(200)
  @Post('notifications/read-all')
  @UseGuards(UserGuard)
  readAll(@Req() req: SessionRequest) {
    return this.service.readNotification(req);
  }
  @HttpCode(200)
  @Post('notifications/:id/read')
  @UseGuards(UserGuard)
  readOne(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.service.readNotification(req, id);
  }
}
