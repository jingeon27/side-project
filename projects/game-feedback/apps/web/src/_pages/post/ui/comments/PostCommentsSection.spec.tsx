import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Comment, Post } from '@/shared/api';

import { PostCommentsSection } from './PostCommentsSection';

const state = vi.hoisted(() => ({
  user: { id: 'viewer' } as { id: string } | null,
  requireLogin: vi.fn(),
  create: vi.fn(),
  notify: vi.fn(),
  older: vi.fn(),
  olderReplies: vi.fn(),
}));

vi.mock('@/features/auth', () => ({
  useSession: () => ({ session: { user: state.user }, requireLogin: state.requireLogin }),
}));
vi.mock('@/features/comment/api/comment.api', () => ({
  postComment: state.create,
  fetchPostComments: ({ cursor }: { cursor: string }) => state.older(cursor),
  fetchCommentReplies: state.olderReplies,
  patchComment: vi.fn(),
  deleteCommentById: vi.fn(),
}));
vi.mock('@/features/user', () => ({
  AuthorLink: ({ author }: { author: { nickname: string } }) => <span>{author.nickname}</span>,
  UserBadges: () => null,
}));
vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/ui')>()),
  useNotify: () => state.notify,
}));
vi.mock('./thread/CommentActions', () => ({
  CommentActions: ({ comment }: { comment: { id: string } }) => (
    <button type="button">{comment.id} 수정·삭제</button>
  ),
}));

const author = {
  id: 'author',
  nickname: '먼저쓴사람',
  isVerified: false,
  supercellTag: null,
  isTestAccount: false,
};
const post = {
  id: 'post',
  title: '함께 이야기해요',
  body: '게시글 본문',
  categoryId: 'category',
  category: { id: 'category', slug: 'game', name: '게임', active: true },
  author,
  gameProfile: null,
  viewCount: 0,
  answerCount: 0,
  helpfulCount: 0,
  createdAt: '2026-10-20T00:00:00Z',
  updatedAt: '2026-10-20T00:00:00Z',
} satisfies Post;

function comment(id: string, parentId: string | null = null): Comment {
  return {
    id,
    parentId,
    replyCount: 0,
    repliesCursor: null,
    postId: post.id,
    body: `${id} 본문`,
    author,
    isDeleted: false,
    createdAt: '2026-10-20T00:00:00Z',
    updatedAt: '2026-10-20T00:00:00Z',
  };
}

function renderComments(comments: Comment[], cursor: string | null = null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PostCommentsSection
        postId={post.id}
        postAuthorId={post.author.id}
        comments={comments}
        cursor={cursor}
        locale="ko"
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.user = { id: 'viewer' };
  state.requireLogin.mockReset();
  state.create.mockReset().mockResolvedValue(comment('new-reply', 'first'));
  state.notify.mockReset();
  state.older.mockReset();
  state.olderReplies.mockReset();
});

describe('comment replies', () => {
  it('keeps the displayed count as a lower bound when earlier replies or filtered authors remain', () => {
    renderComments([
      { ...comment('first'), replyCount: 205, repliesCursor: 'earlier-replies' },
      comment('visible-reply', 'first'),
    ]);
    expect(screen.getByRole('heading', { name: '댓글2개 이상' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '이전 답글 더 보기' })).toBeTruthy();
    expect(state.olderReplies).not.toHaveBeenCalled();
  });

  it('nests replies under their root and keeps replies beneath an anonymous deleted root', () => {
    const removed: Comment = {
      ...comment('removed'),
      author: null,
      body: '',
      isDeleted: true,
      parentId: null,
      replyCount: 1,
    };
    renderComments([
      { ...comment('first'), replyCount: 1 },
      removed,
      comment('last'),
      comment('first-reply', 'first'),
      comment('removed-reply', 'removed'),
    ]);
    const list = screen.getByRole('list', { name: '댓글' });
    const roots = within(list)
      .getAllByRole('listitem')
      .filter((item) => item.parentElement === list);
    expect(roots).toHaveLength(3);
    const [firstRoot, removedRoot] = roots;
    if (!firstRoot || !removedRoot) throw new Error('Expected both comment threads.');
    expect(within(firstRoot).getByRole('list', { name: '답글' }).textContent).toContain('first-reply 본문');
    expect(within(removedRoot).getByText('삭제된 댓글이에요.')).toBeTruthy();
    expect(within(removedRoot).getByRole('list', { name: '답글' }).textContent).toContain(
      'removed-reply 본문',
    );
    expect(within(removedRoot).queryByRole('button', { name: 'removed 수정·삭제' })).toBeNull();
    expect(screen.getByRole('heading', { name: '댓글4' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '답글' })).toHaveLength(3);
    expect(within(removedRoot).queryByRole('button', { name: '답글' })).toBeNull();
    expect(screen.getByRole('button', { name: 'first-reply 수정·삭제' })).toBeTruthy();
  });

  it('requests login before opening a reply form for a visitor', () => {
    state.user = null;
    renderComments([comment('first')]);
    fireEvent.click(screen.getByRole('button', { name: '답글' }));
    expect(state.requireLogin).toHaveBeenCalledOnce();
    expect(screen.queryByRole('textbox', { name: '답글 내용' })).toBeNull();
  });

  it('posts to the selected root and closes only after success', async () => {
    renderComments([comment('first'), comment('second')]);
    const secondThread = screen.getByText('second 본문').closest('li');
    if (!secondThread) throw new Error('Expected the second comment thread.');
    fireEvent.click(within(secondThread).getByRole('button', { name: '답글' }));
    fireEvent.change(screen.getByRole('textbox', { name: '답글 내용' }), {
      target: { value: '두 번째 댓글에 답해요' },
    });
    fireEvent.click(screen.getByRole('button', { name: '답글 등록' }));
    await waitFor(() =>
      expect(state.create).toHaveBeenCalledWith(
        { postId: 'post', body: { body: '두 번째 댓글에 답해요', parentId: 'second' } },
        expect.anything(),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('textbox', { name: '답글 내용' })).toBeNull());
    expect(state.notify).toHaveBeenCalledWith('답글을 남겼어요.');
  });

  it('locks the reply while saving and preserves the draft on failure for a retry', async () => {
    const pending = Promise.withResolvers<Comment>();
    state.create.mockReturnValueOnce(pending.promise);
    renderComments([comment('first')]);
    fireEvent.click(screen.getByRole('button', { name: '답글' }));
    fireEvent.change(screen.getByRole('textbox', { name: '답글 내용' }), {
      target: { value: '실패해도 남아야 하는 답글' },
    });
    fireEvent.click(screen.getByRole('button', { name: '답글 등록' }));
    await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: '답글 내용' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '취소' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '답글 등록' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '답글 등록' }));
    expect(state.create).toHaveBeenCalledOnce();
    await act(async () => pending.reject(new Error('잠시 후 다시 시도해주세요.')));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('잠시 후 다시 시도해주세요.'));
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: '답글 내용' }).value).toBe(
      '실패해도 남아야 하는 답글',
    );
    fireEvent.click(screen.getByRole('button', { name: '답글 등록' }));
    await waitFor(() => expect(state.create).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: '답글 내용' })).toBeNull());
  });

  it('cancels without submitting and opens an empty composer next time', () => {
    renderComments([comment('first')]);
    fireEvent.click(screen.getByRole('button', { name: '답글' }));
    fireEvent.change(screen.getByRole('textbox', { name: '답글 내용' }), {
      target: { value: '취소할 초안' },
    });
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(state.create).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: '답글 내용' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '답글' }));
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: '답글 내용' }).value).toBe('');
  });
});

describe('earlier comment pages', () => {
  it('prepends older threads page by page and hides the button after the oldest page', async () => {
    state.older.mockImplementation(async (cursor: string) =>
      cursor === 'cursor-1'
        ? {
            items: [{ ...comment('older-2'), replyCount: 1 }, comment('older-2-reply', 'older-2')],
            nextCursor: 'cursor-2',
          }
        : { items: [comment('older-1')], nextCursor: null },
    );
    renderComments([comment('latest')], 'cursor-1');
    expect(screen.getByRole('heading', { name: '댓글1개 이상' })).toBeTruthy();
    expect(state.older).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '이전 댓글 더 보기' }));
    await waitFor(() => expect(screen.getByText('older-2 본문')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '이전 댓글 더 보기' }));
    await waitFor(() => expect(screen.getByText('older-1 본문')).toBeTruthy());
    expect(state.older.mock.calls.map(([cursor]) => cursor)).toEqual(['cursor-1', 'cursor-2']);
    const list = screen.getByRole('list', { name: '댓글' });
    const roots = within(list)
      .getAllByRole('listitem')
      .filter((item) => item.parentElement === list)
      .map((item) => item.querySelector('p')?.textContent);
    expect(roots).toEqual(['older-1 본문', 'older-2 본문', 'latest 본문']);
    expect(within(list).getByRole('list', { name: '답글' }).textContent).toContain('older-2-reply 본문');
    expect(screen.queryByRole('button', { name: '이전 댓글 더 보기' })).toBeNull();
    expect(screen.getByRole('heading', { name: '댓글4' })).toBeTruthy();
  });

  it('keeps the button for a retry when an older page fails', async () => {
    state.older.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({
      items: [comment('older')],
      nextCursor: null,
    });
    renderComments([comment('latest')], 'cursor-1');
    fireEvent.click(screen.getByRole('button', { name: '이전 댓글 더 보기' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('이전 댓글을 불러오지 못했어요. 다시 시도해주세요.'),
    );
    fireEvent.click(screen.getByRole('button', { name: '이전 댓글 더 보기' }));
    await waitFor(() => expect(screen.getByText('older 본문')).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
