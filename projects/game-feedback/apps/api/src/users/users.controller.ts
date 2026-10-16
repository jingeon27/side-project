import { Body, Controller, Get, Inject, Param, Patch, Req } from '@nestjs/common';
import type { SessionRequest } from '../auth/session.types';
import { UsersService } from './users.service';

@Controller('api')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get('users/:id')
  profile(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.users.profile(req, id);
  }

  @Patch('admin/users/:id/verification')
  setVerification(@Req() req: SessionRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.users.setVerification(req, id, body);
  }
}
