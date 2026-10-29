import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { postDetailOptions } from '@/features/post';
import type { Comment, Post } from '@/shared/api';

import { PostCommentThread } from './PostCommentThread';

const state = vi.hoisted(() => ({ fetchReplies: vi.fn() }));
vi.mock('@/features/comment/api/comment.api', () => ({
  fetchCommentReplies: state.fetchReplies,
  fetchPostComments: vi.fn(),
  postComment: vi.fn(),
  patchComment: vi.fn(),
  deleteCommentById: vi.fn(),
}));
vi.mock('@/features/auth', () => ({
  useSession: () => ({ session: { user: { id: 'viewer' } }, login: vi.fn() }),
}));
vi.mock('@/features/user', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/user')>()),
  AuthorLink: ({ author }: { author: { nickname: string } }) => <span>{author.nickname}</span>,
}));
vi.mock('./CommentActions', () => ({ CommentActions: () => null }));

const author = {
  id: 'author',
  nickname: '먼저쓴사람',
  isVerified: true,
  supercellTag: '#GG829JGY',
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
const comment = {
  id: 'first',
  parentId: null,
  replyCount: 0,
  repliesCursor: null,
  postId: post.id,
  body: '첫 댓글',
  author,
  isDeleted: false,
  createdAt: '2026-10-20T00:00:00Z',
  updatedAt: '2026-10-20T00:00:00Z',
} satisfies Comment;

function renderThread(root: Comment, replies: Comment[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PostCommentThread thread={{ comment: root, replies }} postAuthorId={post.author.id} locale="ko" />
    </QueryClientProvider>,
  );
  return client;
}

function reply(index: number): Extract<Comment, { isDeleted: false }> {
  return {
    ...comment,
    id: `reply-${String(index).padStart(3, '0')}`,
    parentId: comment.id,
    body: `답글 ${index}`,
  };
}

beforeEach(() => {
  state.fetchReplies.mockReset();
});

function expectControlledElementsExist(container: HTMLElement) {
  for (const element of container.querySelectorAll('[aria-controls]'))
    expect(document.getElementById(element.getAttribute('aria-controls') ?? '')).not.toBeNull();
}

describe('답글 버튼 접근성', () => {
  it('닫힌 상태에서 없는 폼을 가리키거나 바뀌지 않는 펼침 상태를 알리지 않아야 한다', () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <PostCommentThread thread={{ comment, replies: [] }} postAuthorId={post.author.id} locale="ko" />
      </QueryClientProvider>,
    );
    const reply = screen.getByRole('button', { name: '답글' });
    expect(reply.hasAttribute('aria-expanded')).toBe(false);
    expectControlledElementsExist(container);
    fireEvent.click(reply);
    expect(screen.getByRole('form', { name: '먼저쓴사람님에게 답글 남기기' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '답글 내용' }));
    expectControlledElementsExist(container);
  });
});

it('댓글과 답글에서는 태그를 숨기고 인증 표시는 유지한다', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PostCommentThread
        thread={{ comment, replies: [{ ...comment, id: 'reply', parentId: comment.id, body: '답글 본문' }] }}
        postAuthorId={post.author.id}
        locale="ko"
      />
    </QueryClientProvider>,
  );
  expect(screen.queryByText('#GG829JGY')).toBeNull();
  expect(screen.getAllByText('인증 유저')).toHaveLength(2);
  expect(screen.getByText('답글 본문', { exact: false })).toBeTruthy();
});

describe('원댓글별 이전 답글', () => {
  it('추가로 읽은 답글 작성자를 멘션하고 해당 답글에 이어 쓸 수 있어야 한다', async () => {
    const older = { ...reply(1), author: { ...author, id: 'older-author', nickname: '이전답글작성자' } };
    state.fetchReplies.mockResolvedValue({ items: [older], nextCursor: null });
    renderThread({ ...comment, replyCount: 2, repliesCursor: 'cursor' }, [
      { ...reply(2), replyToId: older.id },
    ]);

    fireEvent.click(screen.getByRole('button', { name: '이전 답글 더 보기' }));
    await screen.findByText('답글 1', { exact: true });
    expect(screen.getByText('답글 2', { exact: true }).textContent).toBe('@이전답글작성자 답글 2');

    const olderReply = screen.getByText('답글 1', { exact: true }).closest('li');
    if (!olderReply) throw new Error('Expected the loaded reply.');
    fireEvent.click(within(olderReply).getByRole('button', { name: '답글' }));
    expect(screen.getByRole('form', { name: '이전답글작성자님에게 답글 남기기' })).toBeTruthy();
    expect(screen.getByRole('list', { name: '답글' }).querySelector('ol')).toBeNull();
  });

  it('200개가 넘는 답글을 끝까지 오래된 순으로 합치고 겹치는 항목은 한 번만 보여야 한다', async () => {
    const replies = Array.from({ length: 205 }, (_, index) => reply(index + 1));
    state.fetchReplies.mockImplementation(async ({ cursor }: { cursor: string }) => {
      const before = Number(cursor);
      const start = Math.max(1, before - 30);
      return {
        // 경계의 답글이 재조회 결과에 겹쳐도 초기 목록과 중복해 그리지 않는다.
        items: replies.slice(start - 1, before),
        nextCursor: start > 1 ? String(start) : null,
      };
    });
    renderThread({ ...comment, replyCount: 205, repliesCursor: '200' }, replies.slice(199));
    expect(state.fetchReplies).not.toHaveBeenCalled();

    for (const start of [170, 140, 110, 80, 50, 20, 1]) {
      fireEvent.click(screen.getByRole('button', { name: '이전 답글 더 보기' }));
      await screen.findByText(`답글 ${start}`, { exact: true });
    }

    const list = screen.getByRole('list', { name: '답글' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('p')?.textContent),
    ).toEqual(replies.map((item) => `@${author.nickname} ${item.body}`));
    expect(state.fetchReplies.mock.calls.map(([input]) => input.cursor)).toEqual([
      '200',
      '170',
      '140',
      '110',
      '80',
      '50',
      '20',
    ]);
    expect(screen.queryByRole('button', { name: '이전 답글 더 보기' })).toBeNull();
  });

  it('초기 답글이 없는 삭제된 원댓글도 더 읽을 수 있고 댓글 변경 시 함께 다시 받아야 한다', async () => {
    const older = reply(1);
    state.fetchReplies.mockResolvedValueOnce({ items: [older], nextCursor: null }).mockResolvedValue({
      items: [{ ...older, body: '수정한 답글' }],
      nextCursor: null,
    });
    const client = renderThread(
      {
        ...comment,
        isDeleted: true,
        body: '',
        author: null,
        replyCount: 1,
        repliesCursor: 'cursor',
      },
      [],
    );
    expect(screen.getByText('삭제된 댓글이에요.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '이전 답글 더 보기' }));
    await screen.findByText('답글 1', { exact: true });
    expect(state.fetchReplies).toHaveBeenCalledWith({ commentId: comment.id, cursor: 'cursor' });

    await act(async () => client.invalidateQueries(postDetailOptions(post.id)));
    expect(await screen.findByText('수정한 답글')).toBeTruthy();
    expect(screen.queryByText('답글 1', { exact: true })).toBeNull();
  });

  it('이전 답글 조회에 실패하면 기존 답글을 보존하고 같은 커서로 재시도해야 한다', async () => {
    state.fetchReplies.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({
      items: [reply(1)],
      nextCursor: null,
    });
    renderThread({ ...comment, replyCount: 2, repliesCursor: 'cursor' }, [reply(2)]);
    fireEvent.click(screen.getByRole('button', { name: '이전 답글 더 보기' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      '이전 답글을 불러오지 못했어요. 다시 시도해주세요.',
    );
    expect(screen.getByText('답글 2', { exact: true })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '이전 답글 더 보기' }));
    await screen.findByText('답글 1', { exact: true });
    expect(state.fetchReplies.mock.calls.map(([input]) => input.cursor)).toEqual(['cursor', 'cursor']);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
