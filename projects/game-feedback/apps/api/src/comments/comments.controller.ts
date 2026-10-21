import { UseGuards, Controller, Delete, HttpCode, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { UserGuard } from '../common/http/session.guard';
import { CommentBodyDto, CreateCommentBodyDto } from './comment-input.dto';
import { ValidatedBody } from '../common/http/request-validation';
import type { SessionRequest } from '../auth/session.types';
import { CommentsService } from './comments.service';

@Controller('api')
export class CommentsController {
  constructor(@Inject(CommentsService) private readonly service: CommentsService) {}
  @HttpCode(200)
  @Post('posts/:id/comments')
  @UseGuards(UserGuard)
  comment(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(CreateCommentBodyDto) body: CreateCommentBodyDto,
  ) {
    return this.service.createComment(req, id, body);
  }
  @Patch('comments/:id')
  @UseGuards(UserGuard)
  editComment(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(CommentBodyDto) body: CommentBodyDto,
  ) {
    return this.service.updateComment(req, id, body);
  }
  @Delete('comments/:id')
  deleteComment(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.service.deleteComment(req, id);
  }
}
