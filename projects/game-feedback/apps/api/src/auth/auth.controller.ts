import { Controller, Delete, Get, HttpCode, Inject, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';

import { SocialProviderSchema, type TSocialProvider } from '@game-feedback/contracts';

import { ContractValuePipe, ValidatedBody } from '../common/http/request-validation';
import { DemoAuthGuard, TestAuthGuard } from '../common/http/session.guard';
import { AppAuthService } from './app-login/app-auth.service';
import {
  AppExchangeInputSchema,
  DemoInputSchema,
  OnboardInputSchema,
  TestLoginInputSchema,
  type TAppExchangeDto,
  type TDemoLoginDto,
  type TOnboardDto,
  type TTestLoginDto,
} from './auth-input.dto';
import { AuthService } from './auth.service';
import { SessionService } from './session/session.service';
import type { SessionRequest } from './session/session.types';

@Controller('api')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AppAuthService) private readonly appAuth: AppAuthService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  @Get('session')
  session(@Req() req: SessionRequest) {
    return this.sessions.session(req);
  }

  @Post('auth/demo')
  @HttpCode(200)
  @UseGuards(DemoAuthGuard)
  demo(
    @Req() req: SessionRequest,
    @Res({ passthrough: true }) res: Response,
    @ValidatedBody(DemoInputSchema) body: TDemoLoginDto,
  ) {
    return this.auth.demo(req, res, body);
  }

  @Get('auth/test-accounts')
  testAccounts() {
    return this.auth.testAccounts();
  }

  @Post('auth/test-login')
  @HttpCode(200)
  @UseGuards(TestAuthGuard)
  testLogin(
    @Req() req: SessionRequest,
    @Res({ passthrough: true }) res: Response,
    @ValidatedBody(TestLoginInputSchema) body: TTestLoginDto,
  ) {
    return this.auth.testLogin(req, res, body);
  }

  @Get('auth/google')
  google(@Req() req: Request, @Res() res: Response) {
    return this.auth.google(req, res);
  }

  @Get('auth/social/:provider')
  social(
    @Req() req: Request,
    @Res() res: Response,
    @Param('provider', new ContractValuePipe(SocialProviderSchema)) provider: TSocialProvider,
  ) {
    return this.auth.social(req, res, provider);
  }

  @Get('auth/social/:provider/callback')
  socialCallback(
    @Req() req: SessionRequest,
    @Res() res: Response,
    @Param('provider', new ContractValuePipe(SocialProviderSchema)) provider: TSocialProvider,
  ) {
    return this.auth.socialCallback(req, res, provider);
  }

  @Post('auth/test-token')
  @HttpCode(200)
  @UseGuards(TestAuthGuard)
  testToken(
    @Req() req: SessionRequest,
    @Res({ passthrough: true }) res: Response,
    @ValidatedBody(TestLoginInputSchema) body: TTestLoginDto,
  ) {
    return this.auth.testToken(req, res, body);
  }

  @Get('auth/google/callback')
  googleCallback(@Req() req: SessionRequest, @Res() res: Response) {
    return this.auth.googleCallback(req, res);
  }

  @Post('auth/app/exchange')
  @HttpCode(200)
  exchangeAppLogin(
    @Req() req: SessionRequest,
    @Res({ passthrough: true }) res: Response,
    @ValidatedBody(AppExchangeInputSchema) body: TAppExchangeDto,
  ) {
    return this.appAuth.exchange(req, res, body);
  }

  @Post('auth/onboard')
  @HttpCode(200)
  onboard(
    @Req() req: SessionRequest,
    @Res({ passthrough: true }) res: Response,
    @ValidatedBody(OnboardInputSchema) body: TOnboardDto,
  ) {
    return this.auth.onboard(req, res, body);
  }

  @Post('auth/logout')
  @HttpCode(200)
  logout(@Req() req: SessionRequest, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req, res);
  }

  @Delete('me')
  deleteAccount(@Req() req: SessionRequest, @Res({ passthrough: true }) res: Response) {
    return this.auth.deleteAccount(req, res);
  }
}
