import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { OverlayProvider } from 'overlay-kit';

import { postTypePolicies } from '../../src/features/post/model/post.type-policies';
import { LatestPosts } from '../../src/widgets/post-feed/ui/LatestPosts';

const client = new ApolloClient({
  cache: new InMemoryCache({ typePolicies: postTypePolicies }),
  link: new HttpLink({ uri: '/__test__/gallery' }),
});

export function GalleryInteractionsExample() {
  return (
    <ApolloProvider client={client}>
      <OverlayProvider>
        <main id="pc-main" className="min-h-dvh bg-sunken px-4 py-8">
          <LatestPosts groupId="test-group" title="최신 게시물" empty={<p>게시물이 없어요.</p>} />
        </main>
      </OverlayProvider>
    </ApolloProvider>
  );
}
