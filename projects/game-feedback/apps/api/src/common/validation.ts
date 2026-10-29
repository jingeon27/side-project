import { z } from 'zod';

import { ApiError } from './http/api-error';

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(400, 'VALIDATION_ERROR', result.error.issues[0]?.message ?? '입력값을 확인해주세요.');
  return result.data;
}
