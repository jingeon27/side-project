import Link from 'next/link';

import { render, screen, within } from '@testing-library/react';
import dayjs from 'dayjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Post } from '@/shared/api';
import { MotionProvider } from '@/shared/motion';

import { PostCard } from './PostCard';
import { PostCardActivity } from './PostCardActivity';
import { PostCardAuthor } from './PostCardAuthor';
import { PostCardAuthorName } from './PostCardAuthorName';
import { PostCardBoard } from './PostCardBoard';
import { PostCardContent } from './PostCardContent';
import { PostCardFooter } from './PostCardFooter';
import { PostCardHeader } from './PostCardHeader';

const category = { id: 'game', slug: 'clash-royale', name: '클래시로얄', active: true };
const post: Post = {
  id: 'post-1',
  title: '덱 피드백 부탁해요',
  body: '호그 덱으로 아레나 15에서 막혔어요.',
  board: 'FEEDBACK',
  categoryId: category.id,
  category,
  author: { id: 'author', nickname: '작성자', isVerified: false, supercellTag: null, isTestAccount: false },
  gameProfile: null,
  viewCount: 7,
  answerCount: 2,
  helpfulCount: 1,
  createdAt: dayjs('2026-10-31T00:00:00Z').toISOString(),
  updatedAt: dayjs('2026-10-31T00:00:00Z').toISOString(),
  battle: null,
  coaching: null,
  friendSale: null,
};

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('게시글 카드 부품 조합', () => {
  it('부품이 카드의 게시글을 읽고 작성자 이름·배지는 화면이 조립해야 한다', () => {
    render(
      <MotionProvider>
        <PostCard post={post}>
          <PostCardHeader>
            <PostCardBoard />
          </PostCardHeader>
          <PostCardContent href="/ko/posts/post-1" />
          <PostCardFooter>
            <PostCardAuthor>
              <PostCardAuthorName>
                <Link href="/ko/users/author">작성자 프로필</Link>
              </PostCardAuthorName>
              <span>인증 배지</span>
            </PostCardAuthor>
            <PostCardActivity />
          </PostCardFooter>
        </PostCard>
      </MotionProvider>,
    );
    const card = screen.getByRole('article');
    expect(card.getAttribute('data-board')).toBe('FEEDBACK');
    expect(within(card).getByRole('link', { name: '덱 피드백 부탁해요' }).getAttribute('href')).toBe(
      '/ko/posts/post-1',
    );
    expect(within(card).getByText('조회 7')).toBeTruthy();
    expect(within(card).getByRole('link', { name: '작성자 프로필' }).closest('strong')).toBeTruthy();
    expect(within(card).getByText('인증 배지')).toBeTruthy();
    expect(within(card).getByText('클래시로얄')).toBeTruthy();
    expect(within(card).getByText('답변')).toBeTruthy();
  });

  it('이름을 넣지 않으면 작성자 닉네임을 보여 줘야 한다', () => {
    render(
      <MotionProvider>
        <PostCard post={post}>
          <PostCardFooter>
            <PostCardAuthor>
              <PostCardAuthorName />
            </PostCardAuthor>
          </PostCardFooter>
        </PostCard>
      </MotionProvider>,
    );
    expect(screen.getByText('작성자').tagName).toBe('STRONG');
  });

  it('카드 밖에서 부품을 쓰면 바로 알려야 한다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<PostCardActivity />)).toThrow('PostCard is required.');
  });
});
