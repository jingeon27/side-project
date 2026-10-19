import { GameProfilesRepository } from './game-profiles.repository';
import { Module } from '@nestjs/common';
import { GameProfilesController } from './game-profiles.controller';
import { GameProfilesService } from './game-profiles.service';

@Module({
  controllers: [GameProfilesController],
  providers: [GameProfilesRepository, GameProfilesService],
  exports: [GameProfilesService],
})
export class GameProfilesModule {}
