import { Scalar, type CustomScalar } from '@nestjs/graphql';
import dayjs from 'dayjs';
import { Kind, type ValueNode } from 'graphql';

import { ERROR_CODE, fail } from '../errors';

@Scalar('DateTime')
export class DateTimeScalar implements CustomScalar<string, Date> {
  description = 'ISO 8601 timestamp';

  parseValue(value: unknown) {
    if (typeof value !== 'string') fail('올바른 날짜를 입력해 주세요.');
    // eslint-disable-next-line side/no-native-date -- 외부 입력을 엄격히 읽는다. dayjs는 날짜만 쓴 값을 기기 시간대로 읽고 2026-13-01을 다음 해로 보정한다.
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) fail('올바른 날짜를 입력해 주세요.');
    return dayjs(timestamp).toDate();
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
