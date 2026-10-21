import { Controller, Get, Inject, Param, Patch, Req, UseGuards } from '@nestjs/common';

import type { SessionRequest } from '../../auth/session.types';
import { ValidatedBody } from '../../common/http/request-validation';
import { AdminGuard } from '../../common/http/session.guard';
import { AdminUsersService } from './admin-users.service';
import { UserBanDto, VerificationDto } from './user-input.dto';

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
    @ValidatedBody(VerificationDto) body: VerificationDto,
  ) {
    return this.users.setVerification(req, id, body);
  }
  @Patch(':id/ban')
  ban(@Req() req: SessionRequest, @Param('id') id: string, @ValidatedBody(UserBanDto) body: UserBanDto) {
    return this.users.ban(req, id, body);
  }
}
