import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';

import { appVersions } from '../config/env';
import type { IAppVersions } from '../config/env';
import { HealthRepository } from './health.repository';

const HEALTH_STATUS = { OK: 'ok', UNAVAILABLE: 'unavailable' } as const;

type THealthStatus = (typeof HEALTH_STATUS)[keyof typeof HEALTH_STATUS];

@Controller()
export class HealthController {
  constructor(private readonly repository: HealthRepository) {}

  /** 배포·테스트 하네스가 기다리는 준비 신호. DB에 닿지 않으면 503 */
  @Get('health')
  async health(@Res({ passthrough: true }) res: Response): Promise<{ status: THealthStatus }> {
    try {
      await this.repository.ping();
      return { status: HEALTH_STATUS.OK };
    } catch {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: HEALTH_STATUS.UNAVAILABLE };
    }
  }

  /** 모바일 셸이 강제 업데이트 여부를 판단한다. */
  @Get('app/config')
  appConfig(): IAppVersions {
    return appVersions();
  }
}
