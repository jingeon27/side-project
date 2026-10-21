import {
  Body,
  Query,
  ValidationPipe,
  type ArgumentMetadata,
  type PipeTransform,
  type Type,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import type { z } from 'zod';

import { parse } from '../validation';
import { ApiError } from './api-error';

interface IRequestDto extends Type<object> {
  readonly contract: z.ZodType;
}

// Explicit expectedType also works in tsx, which does not emit design:paramtypes.
export class RequestValidationPipe implements PipeTransform<unknown, Promise<unknown>> {
  private readonly validator: ValidationPipe;
  constructor(
    private readonly dto: IRequestDto,
    query = false,
  ) {
    this.validator = new ValidationPipe({
      expectedType: dto,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      whitelist: true,
      forbidNonWhitelisted: !query,
      forbidUnknownValues: true,
      validationError: { target: false, value: false },
      exceptionFactory: () => new ApiError(400, 'VALIDATION_ERROR', '입력값을 확인해주세요.'),
    });
  }
  async transform(value: unknown, metadata: ArgumentMetadata) {
    // Validate the original object before Nest strips prototype keys; also preserve
    // the contract's JSON refinements and normalization used by OpenAPI/SDK.
    const input = parse(this.dto.contract, value);
    await this.validator.transform(input, metadata);
    return input;
  }
}
export function ValidatedBody(dto: IRequestDto): ParameterDecorator {
  return Body(new RequestValidationPipe(dto));
}
export function ValidatedQuery(dto: IRequestDto): ParameterDecorator {
  return Query(new RequestValidationPipe(dto, true));
}
export function Trim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
}

export class ContractValuePipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly contract: z.ZodType<T>) {}
  transform(value: unknown): T {
    return parse(this.contract, value);
  }
}
