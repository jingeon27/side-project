import { Controller, Delete, Get, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';

import type { SessionRequest } from '../auth/session.types';
import { ValidatedBody } from '../common/http/request-validation';
import { UserGuard } from '../common/http/session.guard';
import { BlockUserDto } from './block-input.dto';
import { BlocksService } from './blocks.service';

@Controller('api')
export class BlocksController {
  constructor(@Inject(BlocksService) private readonly blocks: BlocksService) {}

  @Get('blocks')
  list(@Req() req: SessionRequest) {
    return this.blocks.blocks(req);
  }

  @HttpCode(200)
  @Post('blocks')
  @UseGuards(UserGuard)
  block(@Req() req: SessionRequest, @ValidatedBody(BlockUserDto) body: BlockUserDto) {
    return this.blocks.block(req, body);
  }

  @Delete('blocks/:id')
  unblock(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.blocks.unblock(req, id);
  }
}
