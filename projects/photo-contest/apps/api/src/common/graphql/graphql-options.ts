import type { ApolloDriverConfig } from '@nestjs/apollo';
import type { GraphQLFormattedError } from 'graphql';
import depthLimit from 'graphql-depth-limit';
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';

import { isProduction } from '../../config/env';
import { GRAPHQL_MAX_DEPTH } from '../../config/limits';
import { GRAPHQL_SCHEMA_GLOB } from '../../config/paths';
import { ERROR_CODE, ERROR_MESSAGE } from '../errors';
import { createGraphqlContext } from './graphql-context';
import { internalErrorReportPlugin } from './internal-error.plugin';

/** 예상하지 못한 오류는 내부 내용을 숨긴다. Sentry 보고는 internalErrorReportPlugin이 한다. */
export function maskInternalError(formatted: GraphQLFormattedError): GraphQLFormattedError {
  if (formatted.extensions?.code !== ERROR_CODE.INTERNAL_SERVER_ERROR) return formatted;
  return {
    message: ERROR_MESSAGE.INTERNAL,
    locations: formatted.locations,
    path: formatted.path,
    extensions: { code: ERROR_CODE.INTERNAL_SERVER_ERROR },
  };
}

/** 앱을 만들 때마다 읽어 테스트가 바꾼 NODE_ENV를 반영한다. */
export async function graphqlOptions(): Promise<ApolloDriverConfig> {
  const { ApolloServerPluginCacheControlDisabled } = await import('@apollo/server/plugin/disabled');
  return {
    typePaths: [GRAPHQL_SCHEMA_GLOB],
    graphiql: false,
    introspection: !isProduction(),
    csrfPrevention: true,
    resolvers: { Upload: GraphQLUpload },
    plugins: [
      // 기본 cache control 플러그인이 no-store 미들웨어의 `private, no-store`를 `no-store`로 덮어쓴다.
      ApolloServerPluginCacheControlDisabled(),
      internalErrorReportPlugin(),
    ],
    validationRules: [depthLimit(GRAPHQL_MAX_DEPTH)],
    formatError: maskInternalError,
    context: createGraphqlContext,
  };
}
