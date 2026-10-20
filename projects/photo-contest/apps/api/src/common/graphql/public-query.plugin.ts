import type { ApolloServerPlugin } from '@apollo/server' with { 'resolution-mode': 'import' };

/** Next Data Cache는 HTTP 200만 저장하므로 공개 조회의 GraphQL 오류를 성공 응답으로 보관하지 않는다. */
export function publicQueryCachePlugin(): ApolloServerPlugin {
  return {
    async requestDidStart() {
      return {
        async willSendResponse({ request, response, operation }) {
          if (response.body.kind !== 'single' || !('data' in response.body.singleResult)) return;
          const publicCacheError =
            operation?.operation === 'query' &&
            request.http?.headers.get('x-photo-contest-public-query') === 'true' &&
            Boolean(response.body.singleResult.errors?.length);
          response.http.status = publicCacheError ? 400 : 200;
        },
      };
    },
  };
}
