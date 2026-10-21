import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma';
import { Database, type TDatabaseClient } from './database.service';

type TResults<T extends Prisma.PrismaPromise<unknown>[]> = { [K in keyof T]: Awaited<T[K]> };

/** 같은 트랜잭션의 조회·쓰기·이벤트를 한 연결에서 실행한다. */
@Injectable()
export class UnitOfWork {
  constructor(private readonly db: Database) {}

  run<T extends Prisma.PrismaPromise<unknown>[]>(queries: [...T]): Promise<TResults<T>>;
  run<T>(work: (client: TDatabaseClient) => Promise<T>): Promise<T>;
  run(
    work: Prisma.PrismaPromise<unknown>[] | ((client: TDatabaseClient) => Promise<unknown>),
  ): Promise<unknown> {
    if (Array.isArray(work)) return this.db.$transaction(work);
    return this.db.$transaction(work);
  }

  atomic<T>(work: (client: TDatabaseClient) => Promise<T>) {
    return this.db.atomic(work);
  }
}
