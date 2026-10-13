'use client';
import { HttpLink } from '@apollo/client';
import { ApolloClient, ApolloNextAppProvider, InMemoryCache } from '@apollo/client-integration-nextjs';
import type { ReactNode } from 'react';
export function AppProvider({ children, apiUrl }: { children: ReactNode; apiUrl: string }) {
  function makeClient() {
    return new ApolloClient({
      cache: new InMemoryCache({
        typePolicies: {
          User: { keyFields: ['id'] },
          Group: { keyFields: ['id'] },
          Contest: { keyFields: ['id'] },
          Submission: { keyFields: ['id'] },
          Query: {
            fields: {
              submissions: {
                keyArgs: ['contestId'],
                merge(existing = [], incoming, { args }) {
                  const merged = existing.slice();
                  for (let i = 0; i < incoming.length; i++) merged[(args?.offset ?? 0) + i] = incoming[i];
                  return merged;
                },
              },
            },
          },
        },
      }),
      link: new HttpLink({
        uri: typeof window === 'undefined' ? `${apiUrl}/graphql` : '/backend/graphql',
        credentials: 'same-origin',
        headers: { 'Apollo-Require-Preflight': 'true' },
        fetchOptions: { cache: 'no-store' },
      }),
    });
  }
  return <ApolloNextAppProvider makeClient={makeClient}>{children}</ApolloNextAppProvider>;
}
