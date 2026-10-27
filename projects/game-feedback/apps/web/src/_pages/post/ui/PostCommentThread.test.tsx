import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Comment, Post } from '@/shared/api';

import { PostCommentThread } from './PostCommentThread';

vi.mock('@/features/auth', () => ({
  useSession: () => ({ session: { user: { id: 'viewer' } }, login: vi.fn() }),
}));
vi.mock('@/features/user', () => ({
  AuthorLink: ({ author }: { author: { nickname: string } }) => <span>{author.nickname}</span>,
  UserBadges: () => null,
}));
vi.mock('./CommentActions', () => ({ CommentActions: () => null }));

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
const comment: Comment = {
  id: 'first',
  parentId: null,
  postId: post.id,
  body: '첫 댓글',
  author,
  isDeleted: false,
  createdAt: '2026-10-20T00:00:00Z',
  updatedAt: '2026-10-20T00:00:00Z',
};

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
