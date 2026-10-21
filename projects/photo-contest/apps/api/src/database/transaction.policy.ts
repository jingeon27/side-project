import { match } from 'ts-pattern';

import { Prisma } from '../../generated/prisma';
import { ERROR_MESSAGE } from '../common/errors';
import { SERIALIZABLE_ATTEMPTS } from '../config/limits';

type TTransactionFailure =
  { action: 'retry' } | { action: 'conflict'; message: string } | { action: 'rethrow'; error: unknown };

export function transactionFailure(error: unknown, attempt: number): TTransactionFailure {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return { action: 'rethrow', error };
  return match(error.code)
    .returnType<TTransactionFailure>()
    .with('P2034', () =>
      attempt < SERIALIZABLE_ATTEMPTS
        ? { action: 'retry' }
        : { action: 'conflict', message: ERROR_MESSAGE.REQUEST_CONFLICT },
    )
    .with('P2002', () => ({ action: 'conflict', message: ERROR_MESSAGE.ALREADY_DONE }))
    .otherwise(() => ({ action: 'rethrow', error }));
}
