import { isDriverAdapterError } from '@prisma/driver-adapter-utils';
import { match } from 'ts-pattern';

import { Prisma } from '../../generated/prisma';
import { ERROR_MESSAGE } from '../common/errors';
import { SERIALIZABLE_ATTEMPTS } from '../config/limits';

type TTransactionFailure =
  { action: 'retry' } | { action: 'conflict'; message: string } | { action: 'rethrow'; error: unknown };

function serializationFailure(attempt: number): TTransactionFailure {
  return attempt < SERIALIZABLE_ATTEMPTS
    ? { action: 'retry' }
    : { action: 'conflict', message: ERROR_MESSAGE.REQUEST_CONFLICT };
}

export function transactionFailure(error: unknown, attempt: number): TTransactionFailure {
  // pg 어댑터의 COMMIT 충돌은 Prisma의 P2034로 감싸지지 않고 전달될 수 있다.
  if (
    error instanceof Error &&
    isDriverAdapterError(error) &&
    error.cause?.kind === 'TransactionWriteConflict'
  )
    return serializationFailure(attempt);
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return { action: 'rethrow', error };
  return match(error.code)
    .returnType<TTransactionFailure>()
    .with('P2034', () => serializationFailure(attempt))
    .with('P2002', () => ({ action: 'conflict', message: ERROR_MESSAGE.ALREADY_DONE }))
    .otherwise(() => ({ action: 'rethrow', error }));
}
