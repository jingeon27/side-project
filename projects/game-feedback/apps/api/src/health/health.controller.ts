import { Controller, Get, Inject } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';

@Controller('api/health')
export class HealthController {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  @Get()
  async health() {
    await this.db.$queryRaw`SELECT 1`;
    return { ok: true };
  }
}
