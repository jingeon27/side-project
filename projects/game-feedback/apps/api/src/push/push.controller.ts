import { Controller, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';

import type { SessionRequest } from '../auth/session.types';
import { ValidatedBody } from '../common/http/request-validation';
import { UserGuard } from '../common/http/session.guard';
import {
  RegisterPushDeviceSchema,
  UnregisterPushDeviceSchema,
  type TRegisterPushDeviceDto,
  type TUnregisterPushDeviceDto,
} from './push.dto';
import { PushService } from './push.service';

@Controller('api/push/devices')
@UseGuards(UserGuard)
export class PushController {
  constructor(@Inject(PushService) private readonly push: PushService) {}
  @Post('register')
  @HttpCode(200)
  register(
    @Req() req: SessionRequest,
    @ValidatedBody(RegisterPushDeviceSchema) input: TRegisterPushDeviceDto,
  ) {
    return this.push.register(req, input);
  }
  @Post('unregister')
  @HttpCode(200)
  unregister(
    @Req() req: SessionRequest,
    @ValidatedBody(UnregisterPushDeviceSchema) input: TUnregisterPushDeviceDto,
  ) {
    return this.push.unregister(req, input.installationId);
  }
}
