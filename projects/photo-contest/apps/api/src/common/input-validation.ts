import { ValidationPipe } from '@nestjs/common';
import { GraphQLError } from 'graphql';

import { ERROR_CODE, isErrorCode } from './errors';

export function createInputValidationPipe() {
  return new ValidationPipe({
    transform: true,
    validateCustomDecorators: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    stopAtFirstError: true,
    validationError: { target: false, value: false },
    exceptionFactory: (errors) => {
      const error = errors[0];
      const constraint = Object.keys(error?.constraints ?? {})[0];
      const code: unknown = constraint ? error?.contexts?.[constraint]?.code : undefined;
      return new GraphQLError(Object.values(error?.constraints ?? {})[0] ?? '입력 내용을 확인해 주세요.', {
        extensions: { code: isErrorCode(code) ? code : ERROR_CODE.BAD_USER_INPUT },
      });
    },
  });
}

export function trimValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export function loginIdValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}
