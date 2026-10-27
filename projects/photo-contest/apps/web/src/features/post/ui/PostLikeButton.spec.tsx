import type { ReactNode } from 'react';

import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider, useQuery } from '@apollo/client/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GalleryPostCardFragmentDoc,
  GalleryPostsDocument,
  PostKind,
  PostSort,
  type GalleryPostCardFragment,
} from '@/shared/api/generated';
import { toast } from '@/shared/model/toast';

import { postTypePolicies } from '../model/post.type-policies';
import { PostLikeButton } from './PostLikeButton';

afterEach(() => vi.restoreAllMocks());

function galleryPost(overrides: Partial<GalleryPostCardFragment> = {}): GalleryPostCardFragment {
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
    linkUrl: null,
    createdAt: '2026-10-26T00:00:00.000Z',
    likeCount: 3,
    commentCount: 0,
    likedByMe: false,
    canDelete: false,
    canModerate: false,
    canInteract: true,
    author: { __typename: 'User', id: 'author', nickname: '작성자', avatar: null },
    ...overrides,
  };
}

/** 좋아요 응답과 인기 목록 재조회를 각각 release 전까지 미룬다. */
function createClient(post = galleryPost(), { reject = false } = {}) {
  const operations: Array<{ name: string; sort?: unknown }> = [];
  const pending: Array<() => void> = [];
  const link = new ApolloLink(
    (operation) =>
      new Observable((sink) => {
        const name = operation.operationName ?? '';
        operations.push({ name, sort: operation.variables.sort });
        const reply = () => {
          if (reject) {
            sink.error(new Error('좋아요를 저장하지 못했습니다.'));
            return;
          }
          if (name === 'GalleryPosts') {
            sink.next({ data: { galleryPosts: [{ ...post, likeCount: 4, likedByMe: true }] } });
            sink.complete();
            return;
          }
          const field = name === 'LikePost' ? 'likePost' : 'unlikePost';
          const liked = name === 'LikePost';
          sink.next({
            data: {
              [field]: {
                __typename: 'GalleryPost',
                id: post.id,
                likeCount: post.likeCount + (liked ? 1 : -1),
                likedByMe: liked,
              },
            },
          });
          sink.complete();
        };
        pending.push(reply);
      }),
  );
  const cache = new InMemoryCache({ typePolicies: postTypePolicies });
  cache.writeFragment({ fragment: GalleryPostCardFragmentDoc, data: post });
  return {
    client: new ApolloClient({ cache, link }),
    operations,
    release: () => act(async () => pending.splice(0).forEach((respond) => respond())),
  };
}

async function renderButton(client: ApolloClient, children?: ReactNode) {
  await act(async () => {
    render(
      <ApolloProvider client={client}>
        {children}
        <PostLikeButton postId="post-1" />
      </ApolloProvider>,
    );
  });
  return screen.getByRole('button', { name: '점심의 순간 좋아요' });
}

describe('PostLikeButton', () => {
  it('누르는 즉시 좋아요 수와 상태를 바꾸고 응답 뒤에도 같은 값을 유지해야 한다', async () => {
    const { client, release } = createClient();
    const user = userEvent.setup();
    const button = await renderButton(client);
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveTextContent('좋아요 4개');
    expect(button).toBeEnabled();

    await release();
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveTextContent('좋아요 4개');
  });

  it('좋아요를 취소하면 즉시 수를 줄여야 한다', async () => {
    const { client } = createClient(galleryPost({ likeCount: 1, likedByMe: true }));
    const user = userEvent.setup();
    const button = await renderButton(client);
    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveTextContent('좋아요 0개');
  });

  it('서버가 거절하면 낙관적으로 바꾼 값을 되돌려야 한다', async () => {
    const { client, release } = createClient(galleryPost(), { reject: true });
    const user = userEvent.setup();
    const button = await renderButton(client);
    await user.click(button);
    expect(button).toHaveTextContent('좋아요 4개');
    await release();
    await waitFor(() => expect(button).toHaveTextContent('좋아요 3개'));
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('응답을 기다리는 동안 다시 눌러도 요청을 한 번만 보내야 한다', async () => {
    const { client, operations } = createClient();
    const user = userEvent.setup();
    const button = await renderButton(client);
    await user.click(button);
    await user.click(button);
    expect(operations.map(({ name }) => name)).toEqual(['LikePost']);
    expect(button).toHaveTextContent('좋아요 4개');
  });

  it('이달의 인기 목록만 뒤에서 다시 받고 그 응답을 기다리지 않아야 한다', async () => {
    const { client, operations, release } = createClient();
    // 화면에 떠 있는 최신·인기 목록. 최신 목록의 사전 데이터는 캐시에 있다.
    client.writeQuery({
      query: GalleryPostsDocument,
      variables: { groupId: null, sort: PostSort.Newest, offset: 0, limit: 24 },
      data: { galleryPosts: [galleryPost()] },
    });
    client.writeQuery({
      query: GalleryPostsDocument,
      variables: { groupId: null, sort: PostSort.MonthlyPopular, offset: 0, limit: 3 },
      data: { galleryPosts: [galleryPost()] },
    });
    function ActiveLists() {
      useQuery(GalleryPostsDocument, {
        variables: { groupId: null, sort: PostSort.Newest, offset: 0, limit: 24 },
      });
      useQuery(GalleryPostsDocument, {
        variables: { groupId: null, sort: PostSort.MonthlyPopular, offset: 0, limit: 3 },
      });
      return null;
    }
    const user = userEvent.setup();
    const button = await renderButton(client, <ActiveLists />);
    await user.click(button);
    await release();

    await waitFor(() =>
      expect(operations).toEqual([
        { name: 'LikePost', sort: undefined },
        { name: 'GalleryPosts', sort: PostSort.MonthlyPopular },
      ]),
    );
    expect(button).not.toHaveAttribute('aria-busy');
    expect(button).toHaveTextContent('좋아요 4개');
  });

  it('그룹에 가입하지 않았으면 좋아요 대신 안내를 보여줘야 한다', async () => {
    const info = vi.spyOn(toast, 'info');
    const { client, operations } = createClient(galleryPost({ canInteract: false }));
    const user = userEvent.setup();
    const button = await renderButton(client);
    await user.click(button);
    expect(info).toHaveBeenCalledWith('그룹에 가입하면 좋아요를 남길 수 있어요.');
    expect(operations).toEqual([]);
    expect(button).toHaveTextContent('좋아요 3개');
  });
});
