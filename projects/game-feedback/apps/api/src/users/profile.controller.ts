import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import type { SessionRequest } from '../auth/session.types';
import { ValidatedBody } from '../common/http/request-validation';
import { UserGuard } from '../common/http/session.guard';
import { AvatarUploadInputSchema, type TAvatarUploadDto } from './avatar-upload.dto';
import { UpdateProfileInputSchema, type TUpdateProfileDto } from './profile-input.dto';
import { ProfileService } from './profile.service';

@Controller('api')
export class ProfileController {
  constructor(@Inject(ProfileService) private readonly profile: ProfileService) {}
  @Patch('profile')
  @UseGuards(UserGuard)
  update(@Req() req: SessionRequest, @ValidatedBody(UpdateProfileInputSchema) body: TUpdateProfileDto) {
    return this.profile.update(req, body);
  }
  @Post('profile/avatar/uploads')
  @HttpCode(200)
  @UseGuards(UserGuard)
  requestUpload(@Req() req: SessionRequest, @ValidatedBody(AvatarUploadInputSchema) body: TAvatarUploadDto) {
    return this.profile.requestUpload(req, body);
  }
  @Post('profile/avatar/uploads/:id/complete')
  @HttpCode(200)
  @UseGuards(UserGuard)
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
