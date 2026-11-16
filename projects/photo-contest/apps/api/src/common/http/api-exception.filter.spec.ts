import type { ArgumentsHost } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { describe, expect, it } from 'vitest';

import { DomainError, ERROR_CODE } from '../errors';
import { ApiExceptionFilter } from './api-exception.filter';

// HTTP 서버 없이 GraphQL의 오류 통과 경계만 확인한다.
const graphqlHost = { getType: () => 'graphql' } as unknown as ArgumentsHost;

describe('GraphQL 예외 필터 경계', () => {
  it('typed 업무 오류와 기존 GraphQLError를 같은 인스턴스로 Apollo에 넘겨야 한다', () => {
    const filter = new ApiExceptionFilter();
    const domain = new DomainError('없음', ERROR_CODE.NOT_FOUND);
    const external = new GraphQLError('검증 실패', { extensions: { code: 'BAD_USER_INPUT' } });
    expect(filter.catch(domain, graphqlHost)).toBe(domain);
    expect(filter.catch(external, graphqlHost)).toBe(external);
  });

  it('일반 오류를 업무 오류로 포장하지 않아야 한다', () => {
    expect(new ApiExceptionFilter().catch(new Error('internal'), graphqlHost)).toBeUndefined();
  });
});
