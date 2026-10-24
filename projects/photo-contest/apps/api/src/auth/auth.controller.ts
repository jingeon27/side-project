import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Redirect,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { ClientAddress } from '../rate-limit/client-address.decorator';
import { DevelopmentLoginGuard } from './auth-attempt.guard';
import { AppLoginExchangeDto, DevLoginDto } from './auth.dto';
import { AuthService, type IAuthConfig } from './auth.service';

const OK = { ok: true } as const;

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // ':provider'보다 먼저 선언해야 /auth/config가 provider로 해석되지 않는다.
  @Get('config')
  config(): IAuthConfig {
    return this.auth.config();
  }

  @Post('dev')
  @UseGuards(DevelopmentLoginGuard)
  @HttpCode(HttpStatus.OK)
  async devLogin(@Body() body: DevLoginDto, @Res({ passthrough: true }) res: Response) {
    await this.auth.devLogin(body.nickname, res);
    return OK;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req, res);
    return OK;
  }

  @Post('app/exchange')
  @HttpCode(HttpStatus.OK)
  async exchangeAppLogin(@Body() body: AppLoginExchangeDto, @Res({ passthrough: true }) res: Response) {
    await this.auth.exchangeAppLogin(body, res);
    return OK;
  }

  @Get(':provider')
  @Redirect()
  async start(
    @Param('provider') provider: string,
    @Query('app_challenge') appChallenge: unknown,
    @ClientAddress() address: string | null,
    @Res({ passthrough: true }) res: Response,
  ) {
    return { url: await this.auth.startOAuth(provider, appChallenge, res, address) };
  }

  @Get(':provider/callback')
  @Redirect()
  async callback(
    @Param('provider') provider: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return { url: await this.auth.completeOAuth(provider, req, res) };
  }
}
