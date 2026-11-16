import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GalleryPostCardFragmentDoc, PostCommentCardFragmentDoc, PostKind } from '@/shared/api/generated';

import { PostCardFrame } from '../../card/PostCardFrame';
import { PostCommentRow } from './PostCommentRow';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const author = { __typename: 'User' as const, id: 'author', nickname: '올린 사람', avatar: null };

describe('PostCommentRow', () => {
  it('같은 사람의 아바타는 게시물 카드와 댓글에서 같은 모양과 색이어야 한다', () => {
    const cache = new InMemoryCache();
    cache.writeFragment({
      fragment: GalleryPostCardFragmentDoc,
      data: {
        __typename: 'GalleryPost',
        id: 'post-1',
        category: null,
        contestId: null,
        contest: null,
        groupId: 'group-1',
        groupName: '웃음 그룹',
        title: '점심의 순간',
        body: '',
        kind: PostKind.Link,
        mediaUrl: null,
        mediaWidth: null,
        mediaHeight: null,
        linkUrl: 'https://example.com/moment',
        createdAt: '2026-10-26T00:00:00.000Z',
        likeCount: 0,
        commentCount: 1,
        likedByMe: false,
        canDelete: false,
        canModerate: false,
        canInteract: true,
        author,
      },
    });
    cache.writeFragment({
      fragment: PostCommentCardFragmentDoc,
      data: {
        __typename: 'PostComment',
        id: 'comment-1',
        parentId: null,
        replyCount: 0,
        likeCount: 0,
        likedByMe: false,
        canInteract: true,
        postId: 'post-1',
        body: '내가 올린 사진에 남긴 댓글',
        createdAt: '2026-10-26T00:00:00.000Z',
        canDelete: false,
        author,
      },
    });
    const { container } = render(
      <ApolloProvider client={new ApolloClient({ cache, link: new MockLink([]) })}>
        <PostCardFrame id="post-1" actions={null} />
        <PostCommentRow id="comment-1" />
      </ApolloProvider>,
    );
    const [card, comment] = container.querySelectorAll('[data-slot="avatar"]');
    expect(card).toBeInTheDocument();
    expect(comment?.className).toBe(card?.className);
  });
});
