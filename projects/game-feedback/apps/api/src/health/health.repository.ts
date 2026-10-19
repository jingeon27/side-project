import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';

@Injectable()
export class HealthRepository {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  ping() {
    return this.db.$queryRaw`SELECT 1`;
  }
}
