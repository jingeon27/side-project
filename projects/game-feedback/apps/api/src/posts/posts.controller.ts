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

import type { SessionRequest } from '../auth/session.types';
import { ListQueryDto } from '../common/http/list-query.dto';
import { ValidatedBody, ValidatedQuery } from '../common/http/request-validation';
import { UserGuard } from '../common/http/session.guard';
import { CreatePostDto, PostViewDto, UpdatePostDto } from './post-input.dto';
import { PostViewsService } from './post-views.service';
import { PostsService } from './posts.service';

@Controller('api')
export class PostsController {
  constructor(
    @Inject(PostsService) private readonly service: PostsService,
    @Inject(PostViewsService) private readonly views: PostViewsService,
  ) {}
  @HttpCode(200)
  @Post('posts/:id/views')
  view(@Req() req: SessionRequest, @Param('id') id: string, @ValidatedBody(PostViewDto) body: PostViewDto) {
    return this.views.record(req, id, body);
  }
  @Get('posts')
  posts(@Req() req: SessionRequest, @ValidatedQuery(ListQueryDto) query: ListQueryDto) {
    return this.service.listPosts(req, query);
  }
  @HttpCode(200)
  @Post('posts')
  @UseGuards(UserGuard)
  createPost(@Req() req: SessionRequest, @ValidatedBody(CreatePostDto) body: CreatePostDto) {
    return this.service.createPost(req, body);
  }
  @Get('posts/:id')
  post(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.service.detail(req, id);
  }
  @Patch('posts/:id')
  @UseGuards(UserGuard)
  updatePost(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(UpdatePostDto) body: UpdatePostDto,
  ) {
    return this.service.updatePost(req, id, body);
  }
  @Delete('posts/:id')
  @UseGuards(UserGuard)
  deletePost(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.service.deletePost(req, id);
  }
  @HttpCode(200)
  @Post('posts/:id/read')
  @UseGuards(UserGuard)
  read(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.service.readPost(req, id);
  }
}
