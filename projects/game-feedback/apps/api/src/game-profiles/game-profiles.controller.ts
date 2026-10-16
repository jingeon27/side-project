import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import type { SessionRequest } from '../auth/session.types';
import { GameProfilesService } from './game-profiles.service';

@Controller('api')
export class GameProfilesController {
  constructor(@Inject(GameProfilesService) private readonly profiles: GameProfilesService) {}

  @Get('game-profiles/:playerTag')
  lookup(@Param('playerTag') playerTag: string) {
    return this.profiles.lookup(playerTag);
  }

  @Get('me/game-accounts')
  gameAccounts(@Req() req: SessionRequest) {
    return this.profiles.gameAccounts(req);
  }

  @Post('me/game-accounts')
  @HttpCode(200)
  saveGameAccount(@Req() req: SessionRequest, @Body() body: unknown) {
    return this.profiles.saveGameAccount(req, body);
  }
}
