import { StandardSchemaValidationPipe, type ArgumentMetadata } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import type { z } from 'zod';

import { ERROR_CODE, type TErrorCode } from './errors';

class InputValidationPipe extends StandardSchemaValidationPipe {
  protected override stripProtoKeys(_value: unknown): void {
    // Strict Zod schemas reject forbidden keys without mutating the request before validation.
  }
}

export function createInputValidationPipe(schema?: z.ZodType, code: TErrorCode = ERROR_CODE.BAD_USER_INPUT) {
  const pipe = new InputValidationPipe({
    validateCustomDecorators: true,
    exceptionFactory: (issues) =>
      new GraphQLError(issues[0]?.message ?? '입력 내용을 확인해 주세요.', { extensions: { code } }),
  });
  return {
    transform(value: unknown, metadata: ArgumentMetadata) {
      // GraphQL Args does not yet propagate Standard Schema metadata; bind its schema explicitly.
      return pipe.transform(value, { ...metadata, schema: schema ?? metadata.schema });
    },
  };
}
