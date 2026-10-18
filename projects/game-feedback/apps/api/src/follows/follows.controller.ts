import { Body, Controller, Delete, Get, Inject, Param, Put, Req } from '@nestjs/common';
import type { SessionRequest } from '../auth/session.types';
import { FollowsService } from './follows.service';

@Controller('api/users/:id/follow')
export class FollowsController {
  constructor(@Inject(FollowsService) private readonly follows: FollowsService) {}

  @Get()
  status(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.follows.status(req, id);
  }

  @Put()
  follow(@Req() req: SessionRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.follows.follow(req, id, body);
  }

  @Delete()
  unfollow(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.follows.unfollow(req, id);
  }
}
