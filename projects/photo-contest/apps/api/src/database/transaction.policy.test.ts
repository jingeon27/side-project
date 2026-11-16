import { DriverAdapterError } from '@prisma/driver-adapter-utils';
import { describe, expect, it } from 'vitest';

import { Prisma } from '../../generated/prisma';
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

describe('unique 충돌 문장 회귀', () => {
  // 어떤 unique 위반이든 '이미 제출하거나 투표했습니다.'로 알려 게시물·가입 충돌에도 엉뚱한 안내가 나갔다.
  const uniqueError = (meta: Record<string, unknown>) =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta,
    });
  const adapterError = (constraint: { index: string } | { fields: string[] }, table?: string) =>
    new DriverAdapterError({ kind: 'UniqueConstraintViolation', constraint, ...(table ? { table } : {}) });

  it.each([
    ['PostContestVote_contestId_voterId_key', ERROR_MESSAGE.ALREADY_VOTED],
    ['Vote_contestId_voterId_key', ERROR_MESSAGE.ALREADY_VOTED],
    ['Submission_contestId_authorId_key', ERROR_MESSAGE.ALREADY_SUBMITTED],
    ['Post_uploadId_key', ERROR_MESSAGE.UPLOAD_ALREADY_USED],
    ['Submission_uploadId_key', ERROR_MESSAGE.UPLOAD_ALREADY_USED],
    ['User_provider_providerId_key', ERROR_MESSAGE.ALREADY_DONE],
  ])('pg 어댑터가 알린 제약 %s에 맞는 문장을 써야 한다', (index, message) => {
    const error = uniqueError({ driverAdapterError: adapterError({ index }) });
    expect(transactionFailure(error, 1)).toEqual({ action: 'conflict', message });
  });

  it('제약 이름 없이 테이블과 필드만 알려도 같은 문장을 써야 한다', () => {
    const error = uniqueError({
      driverAdapterError: adapterError({ fields: ['contestId', 'voterId'] }, 'PostContestVote'),
    });
    expect(transactionFailure(error, 1)).toEqual({
      action: 'conflict',
      message: ERROR_MESSAGE.ALREADY_VOTED,
    });
  });

  it('엔진 오류의 target 필드·이름도 같은 문장으로 바꿔야 한다', () => {
    expect(
      transactionFailure(uniqueError({ modelName: 'Submission', target: ['contestId', 'authorId'] }), 1),
    ).toEqual({ action: 'conflict', message: ERROR_MESSAGE.ALREADY_SUBMITTED });
    expect(transactionFailure(uniqueError({ target: 'Post_uploadId_key' }), 1)).toEqual({
      action: 'conflict',
      message: ERROR_MESSAGE.UPLOAD_ALREADY_USED,
    });
  });

  it('알 수 없는 제약과 깨진 meta는 일반 중복 문장을 써야 한다', () => {
    for (const meta of [{}, { target: 42 }, { driverAdapterError: 'broken' }])
      expect(transactionFailure(uniqueError(meta), 1)).toEqual({
        action: 'conflict',
        message: ERROR_MESSAGE.ALREADY_DONE,
      });
  });
});
