import { Module } from '@nestjs/common';

import { GameProfilesController } from './game-profiles.controller';
import { GameProfilesService } from './game-profiles.service';
import { profileProvider } from './providers/profile-provider.factory';

@Module({
  controllers: [GameProfilesController],
  providers: [profileProvider, GameProfilesService],
  exports: [GameProfilesService],
})
export class GameProfilesModule {}
