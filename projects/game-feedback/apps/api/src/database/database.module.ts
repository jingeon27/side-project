import { Global, Module, type DynamicModule, type OnApplicationShutdown } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { PrismaClient } from '../generated/prisma';
import { createPrismaAdapter } from './prisma-adapter';
import { UnitOfWork } from './unit-of-work';

class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(
    private readonly db: PrismaClient,
    private readonly owned: boolean,
  ) {}

  async onApplicationShutdown() {
    if (this.owned) await this.db.$disconnect();
  }
}

@Global()
@Module({})
export class DatabaseModule {
  static register(config: AppConfig, providedClient?: PrismaClient): DynamicModule {
    const db = providedClient ?? new PrismaClient({ adapter: createPrismaAdapter(config.databaseUrl) });
    return {
      module: DatabaseModule,
      providers: [
        UnitOfWork,
        { provide: APP_CONFIG, useValue: config },
        { provide: PrismaClient, useValue: db },
        { provide: DatabaseLifecycle, useValue: new DatabaseLifecycle(db, !providedClient) },
      ],
      exports: [APP_CONFIG, PrismaClient, UnitOfWork],
    };
  }
}
