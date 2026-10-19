import { Injectable } from '@nestjs/common';
import { Database } from '../database/database.service';

@Injectable()
export class HealthRepository {
  constructor(private readonly db: Database) {}

  ping() {
    return this.db.$queryRaw`SELECT 1`;
  }
}
