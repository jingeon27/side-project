import { UnitOfWork } from './unit-of-work';
import { Global, Module, type DynamicModule, type OnApplicationShutdown } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';
import { APP_CONFIG, type AppConfig } from '../config/app.config';

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
    const db = providedClient ?? new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
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
