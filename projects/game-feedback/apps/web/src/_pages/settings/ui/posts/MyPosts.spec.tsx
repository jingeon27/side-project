import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { postListOptions } from '@/features/post';

import { MyPosts } from './MyPosts';

it('shows the empty personal post list without a compose entry', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(postListOptions({ authorId: 'player', board: 'ALL', limit: 6 }).queryKey, {
    pages: [{ items: [], nextCursor: null }],
    pageParams: [''],
  });
  const view = render(
    <QueryClientProvider client={client}>
      <MyPosts locale="ko" userId="player" />
    </QueryClientProvider>,
  );
  try {
    expect(screen.getByText('아직 작성한 글이 없어요.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '글쓰기' })).toBeNull();
    expect(screen.queryByRole('link', { name: '글쓰기' })).toBeNull();
  } finally {
    view.unmount();
    client.clear();
  }
});
