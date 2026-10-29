import { Controller, Get, Inject, Param, Patch, Req, UseGuards } from '@nestjs/common';

import type { SessionRequest } from '../../auth/session/session.types';
import { ValidatedBody } from '../../common/http/request-validation';
import { AdminGuard } from '../../common/http/session.guard';
import { AdminUsersService } from './admin-users.service';
import {
  UserBanInputSchema,
  VerificationInputSchema,
  type TUserBanDto,
  type TVerificationDto,
} from './user-input.dto';

@UseGuards(AdminGuard)
@Controller('api/admin/users')
export class AdminUsersController {
  constructor(@Inject(AdminUsersService) private readonly users: AdminUsersService) {}
  @Get(':id')
  user(@Req() req: SessionRequest, @Param('id') id: string) {
    return this.users.user(req, id);
  }
  @Patch(':id/verification')
  setVerification(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(VerificationInputSchema) body: TVerificationDto,
  ) {
    return this.users.setVerification(req, id, body);
  }
  @Patch(':id/ban')
  ban(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(UserBanInputSchema) body: TUserBanDto,
  ) {
    return this.users.ban(req, id, body);
  }
}
