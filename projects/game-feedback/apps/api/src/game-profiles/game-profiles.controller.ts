import { Controller, Get, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';

import { PlayerTagSchema } from '@game-feedback/contracts';

import type { SessionRequest } from '../auth/session.types';
import { ContractValuePipe, ValidatedBody } from '../common/http/request-validation';
import { UserGuard } from '../common/http/session.guard';
import { GameAccountDto } from './game-account-input.dto';
import { GameProfilesService } from './game-profiles.service';

@Controller('api')
export class GameProfilesController {
  constructor(@Inject(GameProfilesService) private readonly profiles: GameProfilesService) {}

  @Get('game-profiles/:playerTag')
  @UseGuards(UserGuard)
  lookup(
    @Req() req: SessionRequest,
    @Param('playerTag', new ContractValuePipe(PlayerTagSchema)) playerTag: string,
  ) {
    return this.profiles.preview(req, playerTag);
  }

  @Get('me/game-accounts')
  @UseGuards(UserGuard)
  gameAccounts(@Req() req: SessionRequest) {
    return this.profiles.gameAccounts(req);
  }

  @Post('me/game-accounts')
  @HttpCode(200)
  @UseGuards(UserGuard)
  saveGameAccount(@Req() req: SessionRequest, @ValidatedBody(GameAccountDto) body: GameAccountDto) {
    return this.profiles.saveGameAccount(req, body);
  }
}
