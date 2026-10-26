import {
  Body,
  Query,
  StandardSchemaValidationPipe,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';
import type { z } from 'zod';

import { parse } from '../validation';
import { ApiError } from './api-error';

export class RequestValidationPipe extends StandardSchemaValidationPipe {
  constructor(private readonly schema?: z.ZodType) {
    super({
      exceptionFactory: (issues) =>
        new ApiError(400, 'VALIDATION_ERROR', issues[0]?.message ?? '입력값을 확인해주세요.'),
    });
  }

  override transform<T>(value: T, metadata: ArgumentMetadata): Promise<T> {
    return super.transform(value, { ...metadata, schema: this.schema ?? metadata.schema });
  }

  protected override stripProtoKeys(_value: unknown): void {
    // Strict contracts must reject forbidden JSON keys before anything removes them.
    // Zod returns the validated payload without changing the original request object.
  }
}

export function ValidatedBody(schema: z.ZodType): ParameterDecorator {
  return Body({ schema });
}

export function ValidatedQuery(schema: z.ZodType): ParameterDecorator {
  return Query({ schema });
}

export class ContractValuePipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly contract: z.ZodType<T>) {}
  transform(value: unknown): T {
    return parse(this.contract, value);
  }
}
