import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import {
  RegisterPushDeviceSchema,
  UnregisterPushDeviceSchema,
  type TRegisterPushDeviceDto,
  type TUnregisterPushDeviceDto,
} from './push.dto';
import { PushService } from './push.service';

@Controller('push/devices')
export class PushController {
  constructor(@Inject(PushService) private readonly push: PushService) {}
  @Post('register')
  @HttpCode(200)
  register(@Req() req: Request, @Body({ schema: RegisterPushDeviceSchema }) input: TRegisterPushDeviceDto) {
    return this.push.register(req, input);
  }
  @Post('unregister')
  @HttpCode(200)
  unregister(
    @Req() req: Request,
    @Body({ schema: UnregisterPushDeviceSchema }) input: TUnregisterPushDeviceDto,
  ) {
    return this.push.unregister(req, input.installationId);
  }
}
