import { describe, expect, it } from 'vitest';
import { Prisma } from '../../generated/prisma';
import { ERROR_MESSAGE } from '../common/errors';
import { SERIALIZABLE_ATTEMPTS } from '../config/limits';
import { transactionFailure } from './transaction.policy';

const databaseError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('Database failure', { code, clientVersion: 'test' });

describe('트랜잭션 재시도 정책', () => {
  it.each([1, 2, 3])('%i번째 직렬화 충돌은 다시 시도해야 한다', (attempt) => {
    expect(transactionFailure(databaseError('P2034'), attempt)).toEqual({ action: 'retry' });
  });
  it('마지막 직렬화 충돌은 사용자에게 재요청 가능한 CONFLICT로 바꿔야 한다', () => {
    expect(transactionFailure(databaseError('P2034'), SERIALIZABLE_ATTEMPTS)).toEqual({
      action: 'conflict',
      message: ERROR_MESSAGE.REQUEST_CONFLICT,
    });
  });
  it.each([1, SERIALIZABLE_ATTEMPTS])('unique 위반은 %i번째에도 재시도하지 않아야 한다', (attempt) => {
    expect(transactionFailure(databaseError('P2002'), attempt)).toEqual({
      action: 'conflict',
      message: ERROR_MESSAGE.ALREADY_DONE,
    });
  });
  it.each(['P2003', 'P2025', 'P2024'])('%s 오류를 직렬화 충돌로 숨기지 않아야 한다', (code) => {
    const error = databaseError(code);
    expect(transactionFailure(error, 1)).toEqual({ action: 'rethrow', error });
  });
  it.each([new Error('failure'), { code: 'P2034' }, null])(
    'Prisma 오류가 아닌 값은 원래 값으로 전파해야 한다: %j',
    (error) => {
      const result = transactionFailure(error, 1);
      expect(result.action).toBe('rethrow');
      if (result.action === 'rethrow') expect(result.error).toBe(error);
    },
  );
});
