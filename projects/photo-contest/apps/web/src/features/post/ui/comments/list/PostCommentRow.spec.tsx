import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  GalleryPostAuthorFragmentDoc,
  MeDocument,
  PostCommentCardFragmentDoc,
  type PostCommentCardFragment,
} from '@/shared/api/generated';

import { PostCommentRow } from './PostCommentRow';

const user = (id: string, nickname: string) => ({ __typename: 'User' as const, id, nickname, avatar: null });

function comment(id: string, author: ReturnType<typeof user>, body: string): PostCommentCardFragment {
  return {
    __typename: 'PostComment',
    id,
    parentId: null,
    replyCount: 0,
    likeCount: 0,
    likedByMe: false,
    canInteract: true,
    postId: 'post-1',
    body,
    createdAt: '2026-10-26T00:00:00.000Z',
    canDelete: false,
    author,
  };
}

function renderRows(ids: string[]) {
  const cache = new InMemoryCache();
  cache.writeQuery({
    query: MeDocument,
    data: { me: { ...user('viewer', '나인 사람'), needsOnboarding: false, isAnonymous: false } },
  });
  cache.writeFragment({
    fragment: GalleryPostAuthorFragmentDoc,
    data: { __typename: 'GalleryPost', id: 'post-1', author: user('author', '올린 사람') },
  });
  for (const data of [
    comment('mine', user('viewer', '나인 사람'), '내가 남긴 댓글'),
    comment('author', user('author', '올린 사람'), '작성자가 남긴 댓글'),
    comment('other', user('friend', '친구'), '친구가 남긴 댓글'),
  ])
    cache.writeFragment({ fragment: PostCommentCardFragmentDoc, data });
  render(
    <ApolloProvider client={new ApolloClient({ cache, link: new MockLink([]) })}>
      {ids.map((id) => (
        <PostCommentRow key={id} id={id} />
      ))}
    </ApolloProvider>,
  );
}

const rowOf = (body: string) => screen.getByText(body).closest('[id^="comment-"]');

describe('PostCommentRow', () => {
  it('목록에서 받지 않고도 내 댓글과 게시물 작성자의 댓글을 표시해야 한다', () => {
    renderRows(['mine', 'author', 'other']);
    expect(rowOf('내가 남긴 댓글')).toHaveTextContent('나인 사람나');
    expect(rowOf('작성자가 남긴 댓글')).toHaveTextContent('올린 사람작성자');
    expect(rowOf('친구가 남긴 댓글')).not.toHaveTextContent(/작성자|친구나/);
  });
});
