import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
  type NormalizedCacheObject,
} from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act } from '@testing-library/react';
import type { ReactElement } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { prerender } from 'react-dom/static';

import { APP_TYPE_POLICIES } from '@/_app/providers/apollo/app.type-policies';
import { createNoNetworkLink } from '@/shared/api/apollo-link.helper';

type TRespond = (operationName: string, variables: Record<string, unknown>) => Record<string, unknown>;

const SERVER_RENDER_TIMEOUT_MS = 3_000;

/**
 * 라우트의 PreloadQuery를 대신한다. 사전 조회한 데이터는 seed로 캐시에 쓰고, 나머지 요청은 앱 SSR과 같은
 * createNoNetworkLink로 실패시킨다. 사전 조회하지 않은 쿼리를 서버에서 시작하면 renderOnServer가 오류를 돌려준다.
 */
export function createServerClient(seed: (cache: InMemoryCache) => void) {
  const cache = new InMemoryCache({ typePolicies: APP_TYPE_POLICIES });
  seed(cache);
  return new ApolloClient({ cache, link: createNoNetworkLink() });
}

/** 서버가 내려준 캐시를 복원하고, 브라우저에서 보낸 요청 이름을 기록해 응답한다. */
export function createBrowserClient(server: ApolloClient, respond: TRespond) {
  const operations: string[] = [];
  const cache = new InMemoryCache({ typePolicies: APP_TYPE_POLICIES });
  // 서버 클라이언트는 createServerClient의 InMemoryCache를 쓰므로 정규화 캐시 형태다.
  cache.restore(server.cache.extract() as NormalizedCacheObject);
  const client = new ApolloClient({
    cache,
    link: new ApolloLink(
      (operation) =>
        new Observable((sink) => {
          const name = operation.operationName ?? '';
          operations.push(name);
          queueMicrotask(() => {
            sink.next({ data: respond(name, operation.variables) });
            sink.complete();
          });
        }),
    ),
  });
  return { client, operations };
}

/**
 * 모든 Suspense 경계가 끝난 서버 HTML을 만든다. 스트리밍 SSR은 늦게 끝났거나 큰 경계를 $RC 스크립트로 채우는데
 * innerHTML은 스크립트를 실행하지 않는다. 그래서 끝날 때까지 기다리고 경계를 나누지 않아, 브라우저가 조각을 모두
 * 적용한 상태와 같은 HTML을 만든다. React가 서버에서 받은 오류(사전 조회하지 않은 쿼리 등)도 함께 돌려준다.
 */
export async function renderOnServer(client: ApolloClient, ui: ReactElement) {
  const errors: unknown[] = [];
  const { prelude } = await prerender(<ApolloProvider client={client}>{ui}</ApolloProvider>, {
    progressiveChunkSize: Number.POSITIVE_INFINITY,
    signal: AbortSignal.timeout(SERVER_RENDER_TIMEOUT_MS),
    onError: (error) => {
      errors.push(error);
    },
  });
  return { html: await new Response(prelude).text(), errors };
}

/** 서버 HTML 위에 hydration하고, 서버 HTML과 어긋나 React가 복구한 오류를 모은다. */
export async function hydrateOnClient(html: string, client: ApolloClient, ui: ReactElement) {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.append(container);
  const recoverableErrors: unknown[] = [];
  let root: Root | undefined;
  await act(async () => {
    root = hydrateRoot(container, <ApolloProvider client={client}>{ui}</ApolloProvider>, {
      onRecoverableError: (error) => {
        recoverableErrors.push(error);
      },
    });
  });
  return {
    container,
    recoverableErrors,
    unmount: () => {
      act(() => root?.unmount());
      container.remove();
    },
  };
}
