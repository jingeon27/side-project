import { Controller, Get, Inject, Param, Req } from '@nestjs/common';

import type { SessionRequest } from '../auth/session/session.types';
import { UsersService } from './users.service';

@Controller('api')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get('users/:id')
  profile(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.users.profile(req, id);
  }
}
