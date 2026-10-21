import { pipeline } from 'node:stream/promises';

import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';

import { NO_STORE } from '../common/http/no-store.middleware';
import { GroupProfileService } from './group-profile.service';

@Controller('groups')
export class GroupProfileController {
  constructor(private readonly profiles: GroupProfileService) {}
  @Get(':groupId/avatar/:avatarId')
  async avatar(@Param('groupId') groupId: string, @Param('avatarId') avatarId: string, @Res() res: Response) {
    const file = await this.profiles.file(groupId, avatarId);
    res.set({
      'Content-Type': 'image/webp',
      'Content-Length': String(file.size),
      'Cache-Control': NO_STORE,
      'X-Content-Type-Options': 'nosniff',
    });
    try {
      await pipeline(file.body, res);
    } catch (error) {
      if (!res.destroyed) throw error;
    }
  }
}
