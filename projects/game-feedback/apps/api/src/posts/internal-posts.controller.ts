import { Controller, Get, Inject, Param, Req } from '@nestjs/common';

import { SessionService } from '../auth/session/session.service';
import type { SessionRequest } from '../auth/session/session.types';
import { PostsService } from './posts.service';

@Controller('internal/posts')
export class InternalPostsController {
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(PostsService) private readonly posts: PostsService,
  ) {}

  @Get(':id/answer-counts')
  async answerCounts(@Req() req: SessionRequest, @Param('id') id: string) {
    await this.sessions.loadSession(req);
    return this.posts.visibleAnswerCounts(req, id);
  }
}
