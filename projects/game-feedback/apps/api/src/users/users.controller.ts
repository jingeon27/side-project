import { Body, Controller, Inject, Param, Patch, Req } from '@nestjs/common';
import type { SessionRequest } from '../auth/session.types';
import { UsersService } from './users.service';

@Controller('api/admin/users')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Patch(':id/verification')
  setVerification(@Req() req: SessionRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.users.setVerification(req, id, body);
  }
}
