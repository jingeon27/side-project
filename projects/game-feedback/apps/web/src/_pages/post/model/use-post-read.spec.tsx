import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Answer, PostDetail } from '@/shared/api';

import { usePostRead } from './use-post-read.hook';

const api = vi.hoisted(() => ({ read: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/features/post/api/post.api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  postPostRead: api.read,
}));

const owner = {
  id: 'owner',
  nickname: '글쓴이',
  isVerified: false,
  supercellTag: null,
  isTestAccount: false,
};
const helper = { ...owner, id: 'helper', nickname: '도우미' };
function answer(id: string): Answer {
  return {
    id,
    postId: 'post-1',
    body: '이렇게 해보세요',
    author: helper,
    helpful: false,
    readAt: null,
    createdAt: '2026-10-20T00:00:00Z',
    updatedAt: '2026-10-20T00:00:00Z',
  };
}
function detail(answers: Answer[]) {
  return {
    post: {
      id: 'post-1',
      title: '피드백 부탁해요',
      body: '본문',
      categoryId: 'category',
      category: { id: 'category', slug: 'game', name: '게임', active: true },
      author: owner,
      gameProfile: null,
      viewCount: 0,
      answerCount: answers.length,
      helpfulCount: 0,
      createdAt: '2026-10-20T00:00:00Z',
      updatedAt: '2026-10-20T00:00:00Z',
    },
    answers,
    answersCursor: null,
    comments: [],
    commentsCursor: null,
  } satisfies PostDetail;
}

describe('post answer read receipts', () => {
  it('marks each unread answer set once and again only when a new answer arrives', async () => {
    const client = new QueryClient();
    const { rerender } = renderHook(({ value }: { value: PostDetail }) => usePostRead(value, owner.id), {
      initialProps: { value: detail([answer('a1')]) },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await waitFor(() => expect(api.read).toHaveBeenCalledOnce());
    rerender({ value: detail([answer('a1')]) });
    rerender({ value: detail([answer('a1')]) });
    expect(api.read).toHaveBeenCalledOnce();
    rerender({ value: detail([answer('a1'), answer('a2')]) });
    await waitFor(() => expect(api.read).toHaveBeenCalledTimes(2));
    expect(api.read).toHaveBeenLastCalledWith({ id: 'post-1' });
  });
});
