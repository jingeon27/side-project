import { Body, Controller, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { SessionService } from '../auth/session.service';
import { CreateTestUserDto, MoveTestContestDto } from './testing.dto';
import { TestingGuard } from './testing.guard';
import { TestingService } from './testing.service';

@Controller('testing')
@UseGuards(TestingGuard)
export class TestingController {
  constructor(
    private readonly testing: TestingService,
    private readonly sessions: SessionService,
  ) {}

  @Post('users')
  async createUser(@Body() body: CreateTestUserDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.testing.createUser(body.nickname, body);
    await this.sessions.start(res, user.id);
    return { user };
  }

  @Post('contests/:id/phase')
  moveContest(@Param('id') id: string, @Body() body: MoveTestContestDto) {
    return this.testing.moveContest(id, body.phase);
  }
}
