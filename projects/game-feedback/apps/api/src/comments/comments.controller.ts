import { Body, Controller, Delete, HttpCode, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import type { SessionRequest } from '../auth/session.types';
import { CommentsService } from './comments.service';

@Controller('api')
export class CommentsController {
  constructor(@Inject(CommentsService) private readonly service: CommentsService) {}
  @HttpCode(200) @Post('posts/:id/comments') comment(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.createComment(req, id, body);
  }
  @Patch('comments/:id') editComment(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.updateComment(req, id, body);
  }
  @Delete('comments/:id') deleteComment(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.service.deleteComment(req, id);
  }
}
