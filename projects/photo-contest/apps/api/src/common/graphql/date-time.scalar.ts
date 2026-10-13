import { Scalar } from '@nestjs/graphql';
import type { CustomScalar } from '@nestjs/graphql';
import { Kind } from 'graphql';
import type { ValueNode } from 'graphql';

import { ERROR_CODE, fail } from '../errors';

@Scalar('DateTime')
export class DateTimeScalar implements CustomScalar<string, Date> {
  description = 'ISO 8601 timestamp';

  parseValue(value: unknown) {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
      fail('올바른 날짜를 입력해 주세요.');
    return new Date(value);
  }

  serialize(value: unknown) {
    if (!(value instanceof Date)) fail('날짜 처리 오류', ERROR_CODE.INTERNAL_SERVER_ERROR);
    return value.toISOString();
  }

  parseLiteral(ast: ValueNode) {
    if (ast.kind !== Kind.STRING) fail('날짜는 문자열이어야 합니다.');
    return this.parseValue(ast.value);
  }
}
