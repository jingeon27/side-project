import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { postDetailOptions } from '@/features/post';
import type { Comment, Post, PostDetail } from '@/shared/api';

import { CommentActions } from './CommentActions';

const state = vi.hoisted(() => ({
  viewerId: 'viewer',
  replace: vi.fn(),
  deleteComment: vi.fn(),
  blockUser: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: state.replace }) }));
vi.mock('@/features/auth', () => ({
  useSession: () => ({ session: { user: { id: state.viewerId } }, requireLogin: vi.fn() }),
}));
vi.mock('@/features/comment/api/comment.api', () => ({
  deleteCommentById: state.deleteComment,
  patchComment: vi.fn(),
  postComment: vi.fn(),
  fetchPostComments: vi.fn(),
}));
vi.mock('@/features/moderation/api/moderation.api', () => ({
  postBlockUser: state.blockUser,
  postReport: vi.fn(),
}));
vi.mock('@/widgets/start-chat', () => ({ StartChatLink: () => null }));

const postAuthor = {
  id: 'post-author',
  nickname: '글쓴이',
  isVerified: false,
  supercellTag: null,
  isTestAccount: false,
};
const commenter = { ...postAuthor, id: 'commenter', nickname: '댓글러' };
const post = {
  id: 'post-1',
  title: '함께 이야기해요',
  body: '게시글 본문',
  categoryId: 'category',
  category: { id: 'category', slug: 'game', name: '게임', active: true },
  author: postAuthor,
  gameProfile: null,
  viewCount: 0,
  answerCount: 0,
  helpfulCount: 0,
  createdAt: '2026-10-20T00:00:00Z',
  updatedAt: '2026-10-20T00:00:00Z',
} satisfies Post;

function comment(author: typeof postAuthor): Extract<Comment, { isDeleted: false }> {
  return {
    id: `comment-by-${author.id}`,
    parentId: null,
    postId: post.id,
    body: '댓글 본문',
    author,
    isDeleted: false,
    createdAt: '2026-10-20T00:00:00Z',
    updatedAt: '2026-10-20T00:00:00Z',
  };
}

function renderActions(value: Extract<Comment, { isDeleted: false }>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const detail: PostDetail = {
    post,
    answers: [],
    answersCursor: null,
    comments: [value],
    commentsCursor: null,
  };
  client.setQueryData(postDetailOptions(post.id).queryKey, detail);
  render(
    <QueryClientProvider client={client}>
      <OverlayProvider>
        <CommentActions comment={value} />
      </OverlayProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.viewerId = 'viewer';
  state.replace.mockReset();
  state.deleteComment.mockReset().mockResolvedValue(undefined);
  state.blockUser.mockReset().mockResolvedValue(undefined);
});
afterEach(() => overlay.unmountAll());

describe('comment actions', () => {
  it('lets the comment owner delete only that comment with the comment notice', async () => {
    state.viewerId = commenter.id;
    renderActions(comment(commenter));
    expect(screen.queryByRole('button', { name: '신고' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    const dialog = await screen.findByRole('dialog', { name: '정말 삭제할까요?' });
    expect(dialog.textContent).toContain('댓글을 삭제해도 다른 사람이 남긴 답글은 유지됩니다.');
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제하기' }));
    await waitFor(() =>
      expect(state.deleteComment).toHaveBeenCalledWith(
        { id: 'comment-by-commenter', postId: post.id },
        expect.anything(),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(state.replace).not.toHaveBeenCalled();
  });

  it('leaves the post after blocking a commenter who also wrote the post', async () => {
    renderActions(comment(postAuthor));
    expect(screen.queryByRole('button', { name: '삭제' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '차단' }));
    fireEvent.click(await screen.findByRole('button', { name: '차단하기' }));
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith('/ko'));
    expect(state.blockUser).toHaveBeenCalledWith({ blockedUserId: postAuthor.id }, expect.anything());
  });

  it('stays on the post after blocking another commenter', async () => {
    renderActions(comment(commenter));
    fireEvent.click(screen.getByRole('button', { name: '차단' }));
    fireEvent.click(await screen.findByRole('button', { name: '차단하기' }));
    await waitFor(() => expect(state.blockUser).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(state.replace).not.toHaveBeenCalled();
  });
});
