import { Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';

import { SessionService } from '../../auth/session/session.service';
import type { SessionRequest } from '../../auth/session/session.types';
import { ValidatedBody } from '../../common/http/request-validation';
import { AdminLoginInputSchema, type TAdminLoginDto } from './admin-auth-input.dto';
import { AdminAuthService } from './admin-auth.service';

@Controller('api/admin/auth')
export class AdminAuthController {
  constructor(
    @Inject(AdminAuthService) private readonly auth: AdminAuthService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}
  @Get('session')
  session(@Req() req: SessionRequest) {
    return this.sessions.session(req);
  }
  @Post('login')
  @HttpCode(200)
  login(
    @Req() req: SessionRequest,
    @Res({ passthrough: true }) res: Response,
    @ValidatedBody(AdminLoginInputSchema) input: TAdminLoginDto,
  ) {
    return this.auth.login(req, res, input);
  }
  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: SessionRequest, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req, res);
  }
}
