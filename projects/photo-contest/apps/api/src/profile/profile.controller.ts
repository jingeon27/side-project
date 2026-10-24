import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';

import { redirectToStorage } from '../common/http/storage-redirect';
import { MediaStorage } from '../storage/media-storage.service';
import { ProfileService } from './profile.service';

@Controller('profiles')
export class ProfileController {
  constructor(
    private readonly profiles: ProfileService,
    private readonly storage: MediaStorage,
  ) {}

  @Get(':userId/avatar/:avatarId')
  async avatar(@Param('userId') userId: string, @Param('avatarId') avatarId: string, @Res() res: Response) {
    redirectToStorage(res, await this.storage.presignRead(await this.profiles.avatarKey(userId, avatarId)));
  }
}
