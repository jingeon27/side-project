import { UseGuards, Controller, Get, Inject, Param, Patch, Req } from '@nestjs/common';
import { AdminGuard } from '../../common/http/session.guard';
import { SupportStatusDto } from './support-input.dto';
import { ValidatedBody } from '../../common/http/request-validation';
import type { SessionRequest } from '../../auth/session.types';
import { AdminSupportService } from './admin-support.service';
@UseGuards(AdminGuard)
@Controller('api/admin/support')
export class AdminSupportController {
  constructor(@Inject(AdminSupportService) private readonly support: AdminSupportService) {}
  @Get()
  list(@Req() req: SessionRequest) {
    return this.support.list(req);
  }
  @Patch(':id')
  status(
    @Req() req: SessionRequest,
    @Param('id') id: string,
    @ValidatedBody(SupportStatusDto) body: SupportStatusDto,
  ) {
    return this.support.status(req, id, body);
  }
}
