import { HealthRepository } from './health.repository';
import { Controller, Get, Inject } from '@nestjs/common';
import { ApiError } from '../common/http/api-error';

@Controller('api/health')
export class HealthController {
  constructor(@Inject(HealthRepository) private readonly repository: HealthRepository) {}

  @Get('live')
  live() {
    return { ok: true };
  }

  @Get(['', 'ready'])
  async health() {
    try {
      await this.repository.ping();
      return { ok: true };
    } catch {
      throw new ApiError(503, 'DATABASE_UNAVAILABLE', '데이터베이스 연결을 확인하고 있습니다.');
    }
  }
}
