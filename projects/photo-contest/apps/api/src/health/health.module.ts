import { HealthRepository } from './health.repository';
import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';

@Module({ controllers: [HealthController], providers: [HealthRepository] })
export class HealthModule {}
