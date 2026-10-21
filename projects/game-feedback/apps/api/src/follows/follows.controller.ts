import { Controller, Delete, Get, Inject, Param, Put, Req, UseGuards } from '@nestjs/common';

import type { SessionRequest } from '../auth/session.types';
import { ValidatedBody } from '../common/http/request-validation';
import { UserGuard } from '../common/http/session.guard';
import { FollowUserDto } from './follow-input.dto';
import { FollowsService } from './follows.service';

@Controller('api/users/:id/follow')
export class FollowsController {
  constructor(@Inject(FollowsService) private readonly follows: FollowsService) {}

  @Get()
  status(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.follows.status(req, id);
  }

  @Put()
  @UseGuards(UserGuard)
  follow(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(FollowUserDto) body: FollowUserDto,
  ) {
    return this.follows.follow(req, id, body);
  }

  @Delete()
  unfollow(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.follows.unfollow(req, id);
  }
}
