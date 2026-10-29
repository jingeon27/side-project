import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { SessionRequest } from '../auth/session/session.types';
import { ListQuerySchema, type TListQueryDto } from '../common/http/list-query.dto';
import { ValidatedBody, ValidatedQuery } from '../common/http/request-validation';
import { UserGuard } from '../common/http/session.guard';
import {
  CommentInputSchema,
  CreateCommentInputSchema,
  type TCommentBodyDto,
  type TCreateCommentBodyDto,
} from './comment-input.dto';
import { CommentsService } from './comments.service';

@Controller('api')
export class CommentsController {
  constructor(@Inject(CommentsService) private readonly service: CommentsService) {}
  @Get('posts/:id/comments')
  comments(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedQuery(ListQuerySchema) query: TListQueryDto,
  ) {
    return this.service.page(req, id, query);
  }
  @HttpCode(200)
  @Post('posts/:id/comments')
  @UseGuards(UserGuard)
  comment(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(CreateCommentInputSchema) body: TCreateCommentBodyDto,
  ) {
    return this.service.createComment(req, id, body);
  }
  @Patch('comments/:id')
  @UseGuards(UserGuard)
  editComment(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(CommentInputSchema) body: TCommentBodyDto,
  ) {
    return this.service.updateComment(req, id, body);
  }
  @Delete('comments/:id')
  @UseGuards(UserGuard)
  deleteComment(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.service.deleteComment(req, id);
  }
}
