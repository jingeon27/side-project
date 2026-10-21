import { Global, Module } from '@nestjs/common';

import { Database } from './database.service';
import { UnitOfWork } from './unit-of-work';

@Global()
@Module({ providers: [Database, UnitOfWork], exports: [Database, UnitOfWork] })
export class DatabaseModule {}
