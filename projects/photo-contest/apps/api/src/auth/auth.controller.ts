import { Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { SessionService } from './session/session.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly sessions: SessionService) {}

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.sessions.end(req, res);
    return { ok: true };
  }
}
