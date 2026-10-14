import { Body, Controller, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';

import { SessionService } from '../auth/session.service';
import { fail } from '../common/errors';
import { PKCE_CHALLENGE_LENGTH, TEXT_LIMIT } from '../config/limits';
import { PHASE } from '../contest/contest.policy';
import { TestingGuard } from './testing.guard';
import { TestingService } from './testing.service';

const nickname = z.string().trim().min(1).max(TEXT_LIMIT.NICKNAME);
const userSchema = z.object({ nickname }).strict();
const phaseSchema = z.object({ phase: z.enum(PHASE) }).strict();
const ticketSchema = z
  .object({ nickname, challenge: z.string().regex(new RegExp(`^[A-Za-z0-9_-]{${PKCE_CHALLENGE_LENGTH}}$`)) })
  .strict();

function parse<TSchema extends z.ZodType>(schema: TSchema, body: unknown): z.output<TSchema> {
  const result = schema.safeParse(body);
  if (!result.success) fail('테스트 입력을 확인해 주세요.');
  return result.data;
}

@Controller('testing')
@UseGuards(TestingGuard)
export class TestingController {
  constructor(
    private readonly testing: TestingService,
    private readonly sessions: SessionService,
  ) {}

  @Post('users')
  async createUser(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const user = await this.testing.createUser(parse(userSchema, body).nickname);
    await this.sessions.start(res, user.id);
    return { user };
  }

  @Post('contests/:id/phase')
  moveContest(@Param('id') id: string, @Body() body: unknown) {
    return this.testing.moveContest(id, parse(phaseSchema, body).phase);
  }

  @Post('app-login-tickets')
  issueAppLoginTicket(@Body() body: unknown) {
    const { nickname, challenge } = parse(ticketSchema, body);
    return this.testing.issueAppLoginTicket(nickname, challenge);
  }
}
