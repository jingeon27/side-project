import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Answer, Post } from '@/shared/api';

import { PostAnswersSection } from './PostAnswersSection';

const state = vi.hoisted(() => ({ later: vi.fn() }));

vi.mock('@/features/answer/api/answer.api', () => ({
  fetchPostAnswers: ({ cursor }: { cursor: string }) => state.later(cursor),
  postAnswer: vi.fn(),
  patchAnswer: vi.fn(),
  deleteAnswerById: vi.fn(),
  postHelpfulAnswer: vi.fn(),
}));
vi.mock('@/features/user', () => ({
  AuthorLink: ({ author }: { author: { nickname: string } }) => <span>{author.nickname}</span>,
  UserBadges: () => null,
}));
vi.mock('./AnswerComposer', () => ({ AnswerComposer: () => null }));
vi.mock('./ContentActions', () => ({ ContentActions: () => null }));
vi.mock('./HelpfulAnswerButton', () => ({ HelpfulAnswerButton: () => null }));

const author = {
  id: 'author',
  nickname: '피드백작성자',
  isVerified: false,
  supercellTag: null,
  isTestAccount: false,
};
function post(answerCount: number): Post {
  return {
    id: 'post',
    title: '피드백 부탁해요',
    body: '게시글 본문',
    board: 'FEEDBACK',
    categoryId: 'category',
    category: { id: 'category', slug: 'game', name: '게임', active: true },
    author: { ...author, id: 'requester' },
    gameProfile: null,
    viewCount: 0,
    answerCount,
    helpfulCount: 0,
    createdAt: '2026-10-20T00:00:00Z',
    updatedAt: '2026-10-20T00:00:00Z',
  };
}
function answer(id: string): Answer {
  return {
    id,
    postId: 'post',
    body: `${id} 본문`,
    author,
    helpful: false,
    readAt: null,
    createdAt: '2026-10-20T00:00:00Z',
    updatedAt: '2026-10-20T00:00:00Z',
  };
}
function renderAnswers(answers: Answer[], cursor: string | null, total = answers.length) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PostAnswersSection post={post(total)} answers={answers} cursor={cursor} locale="ko" />
    </QueryClientProvider>,
  );
}

beforeEach(() => state.later.mockReset());

describe('later answer pages', () => {
  it('shows the total count and appends later answers page by page until the last one', async () => {
    state.later.mockImplementation(async (cursor: string) =>
      cursor === 'cursor-1'
        ? { items: [answer('second')], nextCursor: 'cursor-2' }
        : { items: [answer('third')], nextCursor: null },
    );
    renderAnswers([answer('first')], 'cursor-1', 3);
    expect(screen.getByRole('heading', { name: '함께 나눈 피드백3' })).toBeTruthy();
    expect(state.later).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '답변 더 보기' }));
    await waitFor(() => expect(screen.getByText('second 본문')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '답변 더 보기' }));
    await waitFor(() => expect(screen.getByText('third 본문')).toBeTruthy());
    expect(state.later.mock.calls.map(([cursor]) => cursor)).toEqual(['cursor-1', 'cursor-2']);
    expect(screen.getAllByText(/본문$/).map((node) => node.textContent)).toEqual([
      'first 본문',
      'second 본문',
      'third 본문',
    ]);
    expect(screen.queryByRole('button', { name: '답변 더 보기' })).toBeNull();
  });

  it('keeps the button for a retry when a later page fails', async () => {
    state.later.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({
      items: [answer('later')],
      nextCursor: null,
    });
    renderAnswers([answer('first')], 'cursor-1', 2);
    fireEvent.click(screen.getByRole('button', { name: '답변 더 보기' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('답변을 더 불러오지 못했어요. 다시 시도해주세요.'),
    );
    fireEvent.click(screen.getByRole('button', { name: '답변 더 보기' }));
    await waitFor(() => expect(screen.getByText('later 본문')).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the empty state without a load button when there are no answers', () => {
    renderAnswers([], null);
    expect(screen.getByText('첫 번째 피드백을 기다리고 있어요')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '답변 더 보기' })).toBeNull();
  });
});
