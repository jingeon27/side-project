import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { AnswerComposer } from './AnswerComposer';

const state = vi.hoisted(() => ({ create: vi.fn(), notify: vi.fn(), requireLogin: vi.fn() }));

vi.mock('@/features/auth', () => ({
  useSession: () => ({
    session: { user: { id: 'viewer', nickname: '작성자', avatarUrl: null } },
    requireLogin: state.requireLogin,
  }),
}));
vi.mock('@/features/answer/api/answer.api', () => ({
  postAnswer: state.create,
  fetchPostAnswers: vi.fn(),
  patchAnswer: vi.fn(),
  deleteAnswerById: vi.fn(),
  postHelpfulAnswer: vi.fn(),
}));
vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/ui')>()),
  useNotify: () => state.notify,
}));

function renderComposer() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <AnswerComposer postId="post" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.create.mockReset().mockResolvedValue({ id: 'answer', postId: 'post' });
  state.notify.mockReset();
  state.requireLogin.mockReset();
});

it('keeps the feedback label and minimum-length guidance after typing and associates validation errors', async () => {
  renderComposer();
  const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: '피드백 내용' });
  expect(input.closest('label')?.textContent).toContain('피드백 내용');
  fireEvent.change(input, { target: { value: '짧아요' } });
  expect(input.closest('label')?.textContent).toContain('10자 이상');
  const form = input.closest('form');
  if (!form) throw new Error('Expected the feedback form.');
  fireEvent.submit(form);
  await waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'));
  expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(screen.getByRole('alert').id);
  expect(state.create).not.toHaveBeenCalled();
});

it('retains the draft and focus during a failed save, then clears only after a successful retry', async () => {
  const pending = Promise.withResolvers<{ id: string; postId: string }>();
  state.create.mockReturnValueOnce(pending.promise);
  renderComposer();
  const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: '피드백 내용' });
  const form = input.closest('form');
  if (!form) throw new Error('Expected the feedback form.');
  fireEvent.change(input, { target: { value: '실패해도 남아야 하는 피드백 초안이에요.' } });
  input.focus();
  fireEvent.submit(form);
  await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
  expect(input.readOnly).toBe(true);
  expect(input.disabled).toBe(false);
  expect(document.activeElement).toBe(input);
  await act(async () => pending.reject(new Error('연결을 확인하고 다시 시도해주세요.')));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toBe('연결을 확인하고 다시 시도해주세요.'),
  );
  expect(input.value).toBe('실패해도 남아야 하는 피드백 초안이에요.');
  expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(screen.getByRole('alert').id);
  fireEvent.submit(form);
  await waitFor(() => expect(state.create).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(input.value).toBe(''));
  expect(state.notify).toHaveBeenCalledOnce();
});
