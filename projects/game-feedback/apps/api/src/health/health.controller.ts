import { Controller, Get, Inject } from '@nestjs/common';
import { HealthRepository } from './health.repository';

@Controller('api/health')
export class HealthController {
  constructor(@Inject(HealthRepository) private readonly repository: HealthRepository) {}

  @Get()
  async health() {
    await this.repository.ping();
    return { ok: true };
  }
}
