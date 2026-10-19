import { TestingRepository } from './testing.repository';
import { Module } from '@nestjs/common';

import { TestingController } from './testing.controller';
import { TestingGuard } from './testing.guard';
import { TestingService } from './testing.service';

@Module({ controllers: [TestingController], providers: [TestingRepository, TestingGuard, TestingService] })
export class TestingModule {}
