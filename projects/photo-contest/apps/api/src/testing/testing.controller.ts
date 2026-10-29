import { Body, Controller, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { SessionService } from '../auth/session.service';
import {
  CreateLegacyTestContestSchema,
  CreateTestUserSchema,
  MoveTestContestSchema,
  type TCreateLegacyTestContestDto,
  type TCreateTestUserDto,
  type TMoveTestContestDto,
} from './testing.dto';
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
  async createUser(
    @Body({ schema: CreateTestUserSchema }) body: TCreateTestUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.testing.createUser(body.nickname, body);
    await this.sessions.start(res, user.id);
    return { user };
  }

  @Post('contests/:id/phase')
  moveContest(@Param('id') id: string, @Body({ schema: MoveTestContestSchema }) body: TMoveTestContestDto) {
    return this.testing.moveContest(id, body.phase);
  }

  @Post('legacy-contests')
  createLegacyContest(@Body({ schema: CreateLegacyTestContestSchema }) body: TCreateLegacyTestContestDto) {
    return this.testing.createLegacyContest(body);
  }
}
