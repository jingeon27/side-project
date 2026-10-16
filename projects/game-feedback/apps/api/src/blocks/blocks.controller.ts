import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import type { SessionRequest } from '../auth/session.types';
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
  block(@Req() req: SessionRequest, @Body() body: unknown) {
    return this.blocks.block(req, body);
  }

  @Delete('blocks/:id')
  unblock(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.blocks.unblock(req, id);
  }
}
