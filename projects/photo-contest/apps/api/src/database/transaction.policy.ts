import { isDriverAdapterError } from '@prisma/driver-adapter-utils';
import { match } from 'ts-pattern';
import { z } from 'zod';

import { Prisma } from '../../generated/prisma';
import { ERROR_MESSAGE } from '../common/errors';
import { SERIALIZABLE_ATTEMPTS } from '../config/limits';

type TTransactionFailure =
  { action: 'retry' } | { action: 'conflict'; message: string } | { action: 'rethrow'; error: unknown };

/** Prisma 기본 이름(`<모델>_<필드…>_key`)의 unique 제약별 사용자 문장. 없는 제약은 ALREADY_DONE으로 알린다. */
const UNIQUE_CONFLICT_MESSAGE: Readonly<Record<string, string>> = {
  Vote_contestId_voterId_key: ERROR_MESSAGE.ALREADY_VOTED,
  PostContestVote_contestId_voterId_key: ERROR_MESSAGE.ALREADY_VOTED,
  Submission_contestId_authorId_key: ERROR_MESSAGE.ALREADY_SUBMITTED,
  Submission_uploadId_key: ERROR_MESSAGE.UPLOAD_ALREADY_USED,
  Post_uploadId_key: ERROR_MESSAGE.UPLOAD_ALREADY_USED,
};

function serializationFailure(attempt: number): TTransactionFailure {
  return attempt < SERIALIZABLE_ATTEMPTS
    ? { action: 'retry' }
    : { action: 'conflict', message: ERROR_MESSAGE.REQUEST_CONFLICT };
}

const Fields = z.array(z.string()).min(1);
// pg 어댑터는 meta.driverAdapterError.cause.constraint에 인덱스 이름이나 필드를, 엔진 오류는 meta.target에 담는다.
const UniqueViolationMeta = z.object({
  modelName: z.string().optional().catch(undefined),
  table: z.string().optional().catch(undefined),
  target: z.union([z.string(), Fields]).optional().catch(undefined),
  driverAdapterError: z
    .object({
      cause: z.object({
        kind: z.literal('UniqueConstraintViolation'),
        table: z.string().optional(),
        constraint: z.union([z.object({ index: z.string() }), z.object({ fields: Fields })]).optional(),
      }),
    })
    .optional()
    .catch(undefined),
});

/** 위반한 unique 제약 이름. 필드만 알면 Prisma 기본 이름(`<모델>_<필드…>_key`)으로 만든다. */
function uniqueConstraintOf(error: Prisma.PrismaClientKnownRequestError): string | null {
  const parsed = UniqueViolationMeta.safeParse(error.meta ?? {});
  if (!parsed.success) return null;
  const { modelName, table, target, driverAdapterError } = parsed.data;
  const constraint = driverAdapterError?.cause.constraint;
  if (constraint && 'index' in constraint) return constraint.index;
  const owner = driverAdapterError?.cause.table ?? table ?? modelName;
  const fields = constraint?.fields ?? (Array.isArray(target) ? target : undefined);
  if (owner && fields) return `${owner}_${fields.join('_')}_key`;
  return typeof target === 'string' ? target : null;
}

function uniqueConflictMessage(error: Prisma.PrismaClientKnownRequestError) {
  const constraint = uniqueConstraintOf(error);
  return (constraint && UNIQUE_CONFLICT_MESSAGE[constraint]) || ERROR_MESSAGE.ALREADY_DONE;
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
    .with('P2002', () => ({ action: 'conflict', message: uniqueConflictMessage(error) }))
    .otherwise(() => ({ action: 'rethrow', error }));
}
