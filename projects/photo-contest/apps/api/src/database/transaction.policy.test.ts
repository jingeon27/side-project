import { DriverAdapterError } from '@prisma/driver-adapter-utils';
import { describe, expect, it } from 'vitest';

import { ERROR_MESSAGE } from '../common/errors';
import { SERIALIZABLE_ATTEMPTS } from '../config/limits';
import { transactionFailure } from './transaction.policy';

describe('Prisma 7 어댑터의 커밋 충돌 회귀', () => {
  it.each([1, 2, 3])('%i번째 어댑터 직렬화 충돌도 재시도해야 한다', (attempt) => {
    const error = new DriverAdapterError({ kind: 'TransactionWriteConflict', originalCode: '40001' });
    expect(transactionFailure(error, attempt)).toEqual({ action: 'retry' });
  });

  it('어댑터 오류도 기존 재시도 한도를 넘으면 CONFLICT로 끝내야 한다', () => {
    const error = new DriverAdapterError({ kind: 'TransactionWriteConflict', originalCode: '40001' });
    expect(transactionFailure(error, SERIALIZABLE_ATTEMPTS)).toEqual({
      action: 'conflict',
      message: ERROR_MESSAGE.REQUEST_CONFLICT,
    });
  });

  it('연결 종료를 직렬화 충돌로 취급하지 않아야 한다', () => {
    const error = new DriverAdapterError({ kind: 'ConnectionClosed' });
    expect(transactionFailure(error, 1)).toEqual({ action: 'rethrow', error });
  });
});
