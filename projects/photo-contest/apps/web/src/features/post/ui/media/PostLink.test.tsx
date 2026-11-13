import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GalleryPostCardFragmentDoc, PostKind, type GalleryPostCardFragment } from '@/shared/api/generated';

import { PostLink } from './PostLink';

function linkPost(linkUrl: string): GalleryPostCardFragment {
  return {
    __typename: 'GalleryPost',
    id: 'post-1',
    category: null,
    contestId: null,
    contest: null,
    groupId: 'group-1',
    groupName: '웃음 그룹',
    title: '함께 볼 영상',
    body: '',
    kind: PostKind.Link,
    mediaUrl: null,
    mediaWidth: null,
    mediaHeight: null,
    linkUrl,
    createdAt: '2026-10-26T00:00:00.000Z',
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    canDelete: false,
    canModerate: false,
    canInteract: true,
    author: { __typename: 'User', id: 'author', nickname: '작성자', avatar: null },
  };
}

function renderLink(linkUrl: string) {
  const cache = new InMemoryCache();
  cache.writeFragment({ fragment: GalleryPostCardFragmentDoc, data: linkPost(linkUrl) });
  render(
    <ApolloProvider client={new ApolloClient({ cache, link: new MockLink([]) })}>
      <PostLink postId="post-1" />
    </ApolloProvider>,
  );
}

describe('PostLink', () => {
  it.each([
    ['https://youtu.be/abcdefghijk', 'YouTube https://youtu.be/abcdefghijk (새 창에서 열림)'],
    ['https://example.com/funny', 'example.com https://example.com/funny (새 창에서 열림)'],
  ])('%s 첨부 링크의 이름은 화면에 보이는 글자를 그대로 담아야 한다', (linkUrl, name) => {
    renderLink(linkUrl);
    const link = screen.getByRole('link', { name });
    expect(link).toHaveAttribute('href', linkUrl);
    expect(link).toHaveAttribute('target', '_blank');
  });
});
