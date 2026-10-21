import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { match } from 'ts-pattern';

import { Prisma, PrismaClient } from '../../generated/prisma';
import { ERROR_CODE, fail } from '../common/errors';
import { transactionFailure } from './transaction.policy';

/** 트랜잭션 안팎 어디서든 같은 조회 함수를 쓰도록 받는 클라이언트 타입 */
export type TDatabaseClient = Prisma.TransactionClient;

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
    return this.attemptAtomic(work, 1);
  }

  private async attemptAtomic<T>(work: (tx: TDatabaseClient) => Promise<T>, attempt: number): Promise<T> {
    try {
      return await this.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      return match(transactionFailure(error, attempt))
        .with({ action: 'retry' }, () => this.attemptAtomic(work, attempt + 1))
        .with({ action: 'conflict' }, ({ message }) => fail(message, ERROR_CODE.CONFLICT))
        .with({ action: 'rethrow' }, ({ error: original }) => {
          throw original;
        })
        .exhaustive();
    }
  }
}
