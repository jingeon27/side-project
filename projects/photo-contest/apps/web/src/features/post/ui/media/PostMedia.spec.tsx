import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GalleryPostCardFragmentDoc, PostKind, type GalleryPostCardFragment } from '@/shared/api/generated';

import { PostMedia } from './PostMedia';

function mediaPost(overrides: Partial<GalleryPostCardFragment> = {}): GalleryPostCardFragment {
  return {
    __typename: 'GalleryPost',
    id: 'post-1',
    category: null,
    contestId: null,
    contest: null,
    groupId: 'group-1',
    groupName: '웃음 그룹',
    title: '점심의 순간',
    body: '',
    kind: PostKind.Photo,
    mediaUrl: '/backend/media/upload-1',
    mediaWidth: null,
    mediaHeight: null,
    linkUrl: null,
    createdAt: '2026-10-26T00:00:00.000Z',
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    canDelete: false,
    canModerate: false,
    canInteract: true,
    author: { __typename: 'User', id: 'author', nickname: '작성자', avatar: null },
    ...overrides,
  };
}

function renderMedia(post: GalleryPostCardFragment, { detail = false, isPriority = false } = {}) {
  const cache = new InMemoryCache();
  cache.writeFragment({ fragment: GalleryPostCardFragmentDoc, data: post });
  render(
    <ApolloProvider client={new ApolloClient({ cache, link: new MockLink([]) })}>
      <PostMedia postId={post.id} detail={detail} isPriority={isPriority} />
    </ApolloProvider>,
  );
}

const photoFrame = () => screen.getByRole('img', { name: '점심의 순간' }).parentElement;

describe('PostMedia', () => {
  it.each([
    ['세로 4:5보다 긴 사진은 4:5', 1000, 2000, '0.8 / 1'],
    ['가로 1.91:1보다 넓은 사진은 1.91:1', 4000, 1000, '1.91 / 1'],
    ['범위 안의 사진은 원래 비율', 360, 240, '1.5 / 1'],
  ])('%s 틀에 담아야 한다', (_, mediaWidth, mediaHeight, ratio) => {
    renderMedia(mediaPost({ mediaWidth, mediaHeight }));
    expect(photoFrame()?.style.aspectRatio).toBe(ratio);
    expect(photoFrame()).not.toHaveClass('aspect-square');
  });

  it.each([
    ['크기가 없는 예전 게시물', null, null],
    ['한쪽 크기만 있는 게시물', 1200, null],
    ['크기가 0인 게시물', 0, 800],
  ])('%s은 정사각형 틀로 대신해야 한다', (_, mediaWidth, mediaHeight) => {
    renderMedia(mediaPost({ mediaWidth, mediaHeight }));
    expect(photoFrame()?.style.aspectRatio).toBe('');
    expect(photoFrame()).toHaveClass('aspect-square');
  });

  it('댓글 창의 원본은 크기가 없으면 4:3 틀을 써야 한다', () => {
    renderMedia(mediaPost(), { detail: true });
    expect(photoFrame()).toHaveClass('aspect-4/3');
    expect(photoFrame()).not.toHaveClass('aspect-square');
  });

  it('동영상도 사진과 같은 비율 범위의 틀을 써야 한다', () => {
    renderMedia(mediaPost({ kind: PostKind.Video, mediaWidth: 1080, mediaHeight: 1920 }));
    expect(screen.getByLabelText('점심의 순간').style.aspectRatio).toBe('0.8 / 1');
  });

  it('첫 화면의 첫 장으로 지정한 사진만 먼저 불러와야 한다', () => {
    renderMedia(mediaPost(), { isPriority: true });
    expect(screen.getByRole('img', { name: '점심의 순간' })).toHaveAttribute('loading', 'eager');
    expect(screen.getByRole('img', { name: '점심의 순간' })).toHaveAttribute('fetchpriority', 'high');
  });
});
