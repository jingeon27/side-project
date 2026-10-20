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
  UploadedFile,
  UseGuards,
  UseInterceptors,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { AVATAR_LIMIT, ProfileService } from './profile.service';

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
  @Post('profile/avatar')
  @HttpCode(200)
  @UseGuards(ProfileUploadGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: AVATAR_LIMIT, files: 1, fields: 0 } }))
  upload(@Req() req: SessionRequest, @UploadedFile() file: unknown) {
    return this.profile.upload(req, file);
  }
  @Delete('profile/avatar')
  remove(@Req() req: SessionRequest) {
    return this.profile.remove(req);
  }
  @Get('users/:id/avatar')
  async file(@Req() req: SessionRequest, @Param('id') id: string, @Res() res: Response) {
    const file = await this.profile.file(req, id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', 'inline; filename="avatar.webp"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.send(file.bytes);
  }
}
