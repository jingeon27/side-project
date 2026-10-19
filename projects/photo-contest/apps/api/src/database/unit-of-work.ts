import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma';
import { Database, type TDatabaseClient } from './database.service';

type TResults<T extends Prisma.PrismaPromise<unknown>[]> = { [K in keyof T]: Awaited<T[K]> };

/** Coordinates domain repositories without opening an independent connection inside a transaction. */
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
