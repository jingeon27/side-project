import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';

import { Prisma, PrismaClient } from '../../generated/prisma';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import { SERIALIZABLE_ATTEMPTS } from '../config/limits';

/** 트랜잭션 안팎 어디서든 같은 조회 함수를 쓰도록 받는 클라이언트 타입 */
export type TDatabaseClient = Prisma.TransactionClient;

const PRISMA_ERROR = {
  UNIQUE_VIOLATION: 'P2002',
  SERIALIZATION_FAILURE: 'P2034',
} as const;

@Injectable()
export class Database extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Serializable 트랜잭션. 동시 요청이 겹치면 다시 시도하고, unique 위반은 CONFLICT로 바꾼다.
   * 1인 1장·1인 1표처럼 DB 제약으로 지키는 규칙은 이 경로로 쓴다.
   */
  async atomic<T>(work: (tx: TDatabaseClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= SERIALIZABLE_ATTEMPTS; attempt++) {
      try {
        return await this.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
        if (error.code === PRISMA_ERROR.SERIALIZATION_FAILURE && attempt < SERIALIZABLE_ATTEMPTS) continue;
        if (error.code === PRISMA_ERROR.SERIALIZATION_FAILURE)
          fail(ERROR_MESSAGE.REQUEST_CONFLICT, ERROR_CODE.CONFLICT);
        if (error.code === PRISMA_ERROR.UNIQUE_VIOLATION)
          fail(ERROR_MESSAGE.ALREADY_DONE, ERROR_CODE.CONFLICT);
        throw error;
      }
    }
    return fail(ERROR_MESSAGE.REQUEST_CONFLICT, ERROR_CODE.CONFLICT);
  }
}
