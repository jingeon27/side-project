import { Inject, Injectable } from '@nestjs/common';

import { PrismaClient, type Prisma } from '../generated/prisma';

type TResults<T extends Prisma.PrismaPromise<unknown>[]> = { [K in keyof T]: Awaited<T[K]> };

/** 같은 트랜잭션의 조회·쓰기·이벤트를 한 연결에서 실행한다. */
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
