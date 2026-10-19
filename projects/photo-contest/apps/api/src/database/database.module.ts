import { UnitOfWork } from './unit-of-work';
import { Global, Module } from '@nestjs/common';

import { Database } from './database.service';

@Global()
@Module({ providers: [Database, UnitOfWork], exports: [Database, UnitOfWork] })
export class DatabaseModule {}
