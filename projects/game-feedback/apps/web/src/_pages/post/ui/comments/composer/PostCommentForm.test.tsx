import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ApiError } from '@/shared/api';

import { PostCommentForm } from './PostCommentForm';

const state = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('@/features/auth', () => ({
  useSession: () => ({ session: { user: { id: 'viewer' } }, requireLogin: vi.fn() }),
}));
// 댓글 api 모듈의 오류 변환까지 거치도록 SDK 요청만 대신한다.
vi.mock('@game-feedback/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@game-feedback/sdk')>()),
  createComment: state.create,
}));

it('shows reconnect guidance instead of the raw browser error and keeps the comment draft', async () => {
  // SDK는 서버에 닿지 못한 fetch 거절을 NETWORK_ERROR로 바꿔 던진다.
  state.create.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Failed to fetch'));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <PostCommentForm postId="post" />
    </QueryClientProvider>,
  );
  const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: '댓글 내용' });
  fireEvent.change(input, { target: { value: '연결이 끊겨도 남아야 하는 댓글' } });
  fireEvent.click(screen.getByRole('button', { name: '댓글 등록' }));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toBe(
      '서버에 연결하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.',
    ),
  );
  expect(state.create).toHaveBeenCalledExactlyOnceWith('post', { body: '연결이 끊겨도 남아야 하는 댓글' });
  expect(screen.queryByText('Failed to fetch')).toBeNull();
  expect(input.value).toBe('연결이 끊겨도 남아야 하는 댓글');
});
