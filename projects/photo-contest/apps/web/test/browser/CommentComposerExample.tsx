import { useState } from 'react';

import { ApolloClient, ApolloLink, HttpLink, InMemoryCache } from '@apollo/client';

import { postTypePolicies } from '../../src/features/post/model/post.type-policies';
import { createErrorToastLink } from '../../src/shared/api/apollo-link.helper';
import { toast } from '../../src/shared/model/toast';
import { ToastProvider } from '../../src/shared/ui/@core/toast';
import { CommentComposerFixture } from '../fixtures/comment-composer';
import { seedCommentComposer } from '../fixtures/comment-composer.data';

export function CommentComposerExample() {
  const parentId = new URLSearchParams(window.location.search).has('reply') ? 'parent-1' : null;
  const [client] = useState(() => {
    const instance = new ApolloClient({
      cache: new InMemoryCache({ typePolicies: postTypePolicies }),
      link: ApolloLink.from([createErrorToastLink(toast.error), new HttpLink({ uri: '/__test__/comments' })]),
    });
    seedCommentComposer(instance, parentId);
    return instance;
  });
  return (
    <ToastProvider>
      <CommentComposerFixture client={client} parentId={parentId} />
    </ToastProvider>
  );
}
