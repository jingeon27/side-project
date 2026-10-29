import { useState } from 'react';

import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GalleryPostsDocument, PostSort } from '@/shared/api/generated';

import { LatestPosts } from './LatestPosts';

function CategoryFeed() {
  const [categoryId, setCategoryId] = useState('failed');
  return (
    <>
      <button type="button" onClick={() => setCategoryId('working')}>
        다른 카테고리
      </button>
      <LatestPosts
        groupId="group-1"
        categoryId={categoryId}
        title="최신 게시물"
        empty={<p>선택한 카테고리는 비어 있어요</p>}
      />
    </>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('카테고리별 게시물 경계', () => {
  it('목록 실패 뒤에도 필터를 유지하고 새 카테고리는 이전 오류 경계에서 복구해야 한다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const variables = { groupId: 'group-1', sort: PostSort.Newest, offset: 0, limit: 24 };
    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: new MockLink([
        {
          request: { query: GalleryPostsDocument, variables: { ...variables, categoryId: 'failed' } },
          error: new Error('목록 연결 실패'),
          delay: 0,
        },
        {
          request: { query: GalleryPostsDocument, variables: { ...variables, categoryId: 'working' } },
          result: { data: { galleryPosts: [] } },
          delay: 0,
        },
      ]),
    });
    await act(async () => {
      render(
        <ApolloProvider client={client}>
          <CategoryFeed />
        </ApolloProvider>,
      );
    });
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByRole('button', { name: '다른 카테고리' })).toBeEnabled();
    await act(async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: '다른 카테고리' }));
    });
    expect(await screen.findByText('선택한 카테고리는 비어 있어요')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
