import 'server-only';
import { cookies } from 'next/headers';
import { HttpLink } from '@apollo/client';
import { ApolloClient, InMemoryCache, registerApolloClient } from '@apollo/client-integration-nextjs';
// Cookies stay on the server; only GraphQL results enter the hydration stream.
export const { PreloadQuery } = registerApolloClient(function makeServerClient() {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({
      uri: `${process.env.API_URL ?? 'http://127.0.0.1:4200'}/graphql`,
      fetch: async (url, options) => {
        const cookie = (await cookies()).toString();
        return fetch(url, {
          ...options,
          cache: 'no-store',
          headers: {
            ...options?.headers,
            Cookie: cookie,
            Origin: new URL(process.env.WEB_ORIGIN ?? 'http://localhost:3200').origin,
            'Apollo-Require-Preflight': 'true',
          },
        });
      },
    }),
  });
});
