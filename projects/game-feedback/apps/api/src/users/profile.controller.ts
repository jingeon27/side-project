import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Response } from 'express';

import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { ValidatedBody } from '../common/http/request-validation';
import { AvatarUploadDto } from './avatar-upload.dto';
import { ProfileService } from './profile.service';

@Injectable()
class ProfileUploadGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    requireUser(context.switchToHttp().getRequest<SessionRequest>());
    return true;
  }
}
@Controller('api')
export class ProfileController {
  constructor(@Inject(ProfileService) private readonly profile: ProfileService) {}
  @Patch('profile')
  update(@Req() req: SessionRequest, @Body() body: unknown) {
    return this.profile.update(req, body);
  }
  @Post('profile/avatar/uploads')
  @HttpCode(200)
  @UseGuards(ProfileUploadGuard)
  requestUpload(@Req() req: SessionRequest, @ValidatedBody(AvatarUploadDto) body: AvatarUploadDto) {
    return this.profile.requestUpload(req, body);
  }
  @Post('profile/avatar/uploads/:id/complete')
  @HttpCode(200)
  @UseGuards(ProfileUploadGuard)
  completeUpload(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.profile.completeUpload(req, id);
  }
  @Delete('profile/avatar/uploads/:id')
  removeUpload(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.profile.removeUpload(req, id);
  }
  @Delete('profile/avatar')
  remove(@Req() req: SessionRequest) {
    return this.profile.remove(req);
  }
  @Get('users/:id/avatar')
  async file(@Req() req: SessionRequest, @Param('id') id: string, @Res() res: Response) {
    const file = await this.profile.file(req, id);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    if (req.method === 'HEAD') {
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Length', file.size);
      res.end();
      return;
    }
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.redirect(307, file.location);
  }
}
