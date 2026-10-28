import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';

import { redirectToStorage } from '../common/http/storage-redirect';
import { MediaStorage } from '../storage/media-storage.service';
import { GroupProfileService } from './group-profile.service';

@Controller('groups')
export class GroupProfileController {
  constructor(
    private readonly profiles: GroupProfileService,
    private readonly storage: MediaStorage,
  ) {}
  @Get(':groupId/avatar/:avatarId')
  async avatar(@Param('groupId') groupId: string, @Param('avatarId') avatarId: string, @Res() res: Response) {
    const key = await this.profiles.avatarKey(groupId, avatarId);
    redirectToStorage(res, await this.storage.presignRead(key));
  }
  @Get(':groupId/cover/:coverId')
  async cover(@Param('groupId') groupId: string, @Param('coverId') coverId: string, @Res() res: Response) {
    const key = await this.profiles.coverKey(groupId, coverId);
    redirectToStorage(res, await this.storage.presignRead(key));
  }
}
