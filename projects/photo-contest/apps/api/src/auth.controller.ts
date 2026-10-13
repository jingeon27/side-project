import { Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, developmentLoginEnabled, webOrigin } from './auth.service';
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Get('config') config() {
    return {
      developmentLogin: developmentLoginEnabled(),
      google: Boolean(process.env.GOOGLE_CLIENT_ID),
      kakao: Boolean(process.env.KAKAO_CLIENT_ID),
    };
  }
  @Post('dev') async dev(@Req() req: Request, @Res() res: Response) {
    await this.auth.devLogin(req.body?.nickname, res);
    res.status(200).json({ ok: true });
  }
  @Post('logout') async logout(@Req() req: Request, @Res() res: Response) {
    await this.auth.logout(req, res);
    res.status(200).json({ ok: true });
  }
  @Get(':provider') start(@Param('provider') provider: string, @Res() res: Response) {
    return this.auth.start(provider, res);
  }
  @Get(':provider/callback') async callback(
    @Param('provider') provider: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      await this.auth.callback(provider, req, res);
    } catch {
      res.redirect(`${webOrigin()}/?loginError=1`);
    }
  }
}
