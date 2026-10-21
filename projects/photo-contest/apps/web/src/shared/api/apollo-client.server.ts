import 'server-only';

import { headers } from 'next/headers';

import { HttpLink } from '@apollo/client';
import { ApolloClient, InMemoryCache, registerApolloClient } from '@apollo/client-integration-nextjs';

import { PUBLIC_QUERY_HEADER } from './public-cache.policy';
import { buildServerRequestHeaders, getServerApiUrl, getWebOrigin } from './server-request.helper';

/**
 * RSC 전용 Apollo Client. 요청마다 새로 만들고, 들어온 요청의 Cookie 헤더를 API로 그대로 전달한다.
 * 결과만 PreloadQuery로 브라우저 캐시에 흘려보내며 쿠키 원문은 서버 밖(클라이언트 props·캐시·로그)으로 나가지 않는다.
 */
export const { getClient, query, PreloadQuery } = registerApolloClient(function makeServerClient() {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({
      uri: `${getServerApiUrl()}/graphql`,
      fetch: async (input, init) => {
        const publicRequest = new Headers(init?.headers).get(PUBLIC_QUERY_HEADER) === 'true';
        const cookie = publicRequest ? null : (await headers()).get('cookie');
        return fetch(input, {
          ...init,
          ...(publicRequest ? {} : { cache: 'no-store' as const }),
          ...(publicRequest ? { credentials: 'omit' as const } : {}),
          headers: buildServerRequestHeaders(init?.headers, { cookie, webOrigin: getWebOrigin() }),
        });
      },
    }),
  });
});
