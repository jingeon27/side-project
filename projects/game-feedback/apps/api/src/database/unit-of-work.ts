import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, type Prisma } from '../generated/prisma';

type TResults<T extends Prisma.PrismaPromise<unknown>[]> = { [K in keyof T]: Awaited<T[K]> };

/** Coordinates domain repositories without opening an independent connection inside a transaction. */
@Injectable()
export class UnitOfWork {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  run<T extends Prisma.PrismaPromise<unknown>[]>(queries: [...T]): Promise<TResults<T>>;
  run<T>(work: (client: Prisma.TransactionClient) => Promise<T>): Promise<T>;
  run(
    work: Prisma.PrismaPromise<unknown>[] | ((client: Prisma.TransactionClient) => Promise<unknown>),
  ): Promise<unknown> {
    if (Array.isArray(work)) return this.db.$transaction(work);
    return this.db.$transaction(work);
  }
}
