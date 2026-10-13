import { ApolloServerPluginCacheControlDisabled } from '@apollo/server/plugin/disabled';
import type { ApolloDriverConfig } from '@nestjs/apollo';
import { captureException } from '@sentry/node';
import { GraphQLError } from 'graphql';
import type { GraphQLFormattedError } from 'graphql';
import depthLimit from 'graphql-depth-limit';

import { isProduction } from '../../config/env';
import { GRAPHQL_MAX_DEPTH } from '../../config/limits';
import { GRAPHQL_SCHEMA_GLOB } from '../../config/paths';
import { ERROR_CODE, ERROR_MESSAGE } from '../errors';
import { createGraphqlContext } from './graphql-context';

const STACK_FRAME = /^\s+at /;

function errorCode(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

/**
 * 원본 메시지에는 Prisma 쿼리 인자(닉네임·설명 등)가 섞일 수 있으므로
 * 오류 종류·코드와 호출 위치(stack frame)만 남긴 오류를 Sentry로 보낸다.
 */
export function reportableError(error: unknown): Error {
  const original = error instanceof GraphQLError && error.originalError ? error.originalError : error;
  const kind = original instanceof Error ? original.name : typeof original;
  const code = errorCode(original);
  const reportable = new Error(`GraphQL operation failed: ${kind}${code ? ` ${code}` : ''}`);
  if (original instanceof Error && original.stack) {
    const frames = original.stack.split('\n').filter((line) => STACK_FRAME.test(line));
    reportable.stack = [`Error: ${reportable.message}`, ...frames].join('\n');
  }
  return reportable;
}

/** 예상하지 못한 오류는 내부 내용을 숨기고 Sentry에만 남긴다. */
export function maskInternalError(formatted: GraphQLFormattedError, error: unknown): GraphQLFormattedError {
  if (formatted.extensions?.code !== ERROR_CODE.INTERNAL_SERVER_ERROR) return formatted;
  captureException(reportableError(error));
  return {
    message: ERROR_MESSAGE.INTERNAL,
    locations: formatted.locations,
    path: formatted.path,
    extensions: { code: ERROR_CODE.INTERNAL_SERVER_ERROR },
  };
}

/** 앱을 만들 때마다 읽어 테스트가 바꾼 NODE_ENV를 반영한다. */
export function graphqlOptions(): ApolloDriverConfig {
  return {
    typePaths: [GRAPHQL_SCHEMA_GLOB],
    graphiql: false,
    introspection: !isProduction(),
    csrfPrevention: true,
    // 기본 cache control 플러그인이 no-store 미들웨어의 `private, no-store`를 `no-store`로 덮어쓴다.
    plugins: [ApolloServerPluginCacheControlDisabled()],
    validationRules: [depthLimit(GRAPHQL_MAX_DEPTH)],
    formatError: maskInternalError,
    context: createGraphqlContext,
  };
}
