'use client';

import { ApolloClient, ApolloNextAppProvider, InMemoryCache } from '@apollo/client-integration-nextjs';
import type { ReactNode } from 'react';

import { createAppLink } from '@/modules/shared/api/apollo-link.helper';
import { toast } from '@/modules/shared/model/toast';

import { APP_TYPE_POLICIES } from './app.type-policies';

/** 요청(SSR)마다, 브라우저에서는 한 번 만들어진다. 계정이 바뀌면 문서를 새로 열어 캐시를 통째로 버린다. */
function makeClient() {
  return new ApolloClient({
    cache: new InMemoryCache({ typePolicies: APP_TYPE_POLICIES }),
    link: createAppLink({
      isServer: typeof window === 'undefined',
      onError: (message) => toast.error(message),
    }),
  });
}

export function AppApolloProvider({ children }: { children: ReactNode }) {
  return <ApolloNextAppProvider makeClient={makeClient}>{children}</ApolloNextAppProvider>;
}
