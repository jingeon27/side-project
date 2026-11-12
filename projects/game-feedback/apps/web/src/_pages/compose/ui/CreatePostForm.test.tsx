import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Category, Post } from '@/shared/api';
import { confirmNavigation, NavigationGuardProvider } from '@/shared/navigation';
import type { PostContentFields } from '@/widgets/post-composer';

import { CreatePostForm } from './CreatePostForm';

const state = vi.hoisted(() => ({ createPost: vi.fn(), replace: vi.fn(), notify: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: state.replace }) }));
vi.mock('@/features/auth', () => ({
  useSession: () => ({ session: { user: { id: 'writer', isVerified: true, role: 'USER' } } }),
}));
vi.mock('@game-feedback/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@game-feedback/sdk')>()),
  createPost: state.createPost,
}));
vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/ui')>()),
  useNotify: () => state.notify,
}));
// 편집기 대신 제목과 본문만 폼에 넣는다. 제출·재시도·이탈 확인은 CreatePostForm이 소유한다.
vi.mock('@/widgets/post-composer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/widgets/post-composer')>()),
  PostContentFields: ({ form }: Parameters<typeof PostContentFields>[0]) => (
    <>
      <input aria-label="제목" {...form.register('title')} />
      <textarea
        aria-label="본문"
        onChange={(event) =>
          form.setValue('body', event.target.value, { shouldDirty: true, shouldValidate: true })
        }
      />
    </>
  ),
}));

const category: Category = { id: 'clash-royale', slug: 'clash-royale', name: '클래시로얄', active: true };
const created = {
  id: 'post-1',
  title: '응답이 끊긴 글쓰기',
  body: '같은 초안을 다시 보내요',
  board: 'FEEDBACK',
  categoryId: category.id,
  category,
  author: { id: 'writer', nickname: '작성자', isVerified: true, supercellTag: null, isTestAccount: false },
  gameProfile: null,
  viewCount: 0,
  answerCount: 0,
  helpfulCount: 0,
  createdAt: '2026-11-11T00:00:00.000Z',
  updatedAt: '2026-11-11T00:00:00.000Z',
} satisfies Post;

function renderForm() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NavigationGuardProvider>
        <CreatePostForm categories={[category]} locale="ko" board="FEEDBACK" />
      </NavigationGuardProvider>
    </QueryClientProvider>,
  );
}
function fillDraft() {
  fireEvent.change(screen.getByRole('textbox', { name: '제목' }), { target: { value: created.title } });
  fireEvent.change(screen.getByRole('textbox', { name: '본문' }), { target: { value: created.body } });
}
function submit() {
  fireEvent.click(screen.getByRole('button', { name: '피드백 요청 올리기' }));
}

beforeEach(() => {
  state.createPost.mockReset().mockResolvedValue(created);
  state.replace.mockReset();
  state.notify.mockReset();
});

describe('글쓰기 등록 실패와 재시도', () => {
  it('연결이 끊기면 다시 시도할 문구를 보이고, 같은 초안의 재시도는 같은 요청 키로 보낸다', async () => {
    state.createPost.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderForm();
    fillDraft();
    submit();
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        '서버에 연결하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.',
      ),
    );
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: '제목' }).value).toBe(created.title);
    submit();
    await waitFor(() => expect(state.replace).toHaveBeenCalledOnce());
    const [first, retry] = state.createPost.mock.calls.map(([body]) => body);
    expect(first.clientRequestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(retry).toEqual(first);
    expect(state.notify).toHaveBeenCalledOnce();
  });

  it('고친 초안은 떠나기 전에 확인하고, 등록한 뒤에는 다시 묻지 않는다', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderForm();
    expect(confirmNavigation()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    fillDraft();
    expect(confirmNavigation()).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: '제목' }).value).toBe(created.title);
    submit();
    await waitFor(() => expect(state.replace).toHaveBeenCalledOnce());
    await act(async () => expect(confirmNavigation()).toBe(true));
    expect(confirm).toHaveBeenCalledOnce();
  });
});
