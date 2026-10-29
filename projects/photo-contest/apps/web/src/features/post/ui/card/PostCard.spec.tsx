import type { ReactElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GalleryPostCardFragmentDoc, PostKind, type GalleryPostCardFragment } from '@/shared/api/generated';
import { APP_MAIN_ID } from '@/shared/constants/layout';

import { PostActionsMenu } from './PostActionsMenu';
import { PostCard } from './PostCard';
import { PostPreviewCard } from './PostPreviewCard';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const post: GalleryPostCardFragment = {
  __typename: 'GalleryPost',
  id: 'post-1',
  category: null,
  contestId: null,
  contest: null,
  groupId: 'group-1',
  groupName: '웃음 그룹',
  title: '점심의 순간',
  body: '밥 먹다 웃은 순간',
  kind: PostKind.Photo,
  mediaUrl: '/backend/media/upload-1',
  linkUrl: null,
  createdAt: '2026-10-26T00:00:00.000Z',
  likeCount: 2,
  commentCount: 1,
  likedByMe: false,
  canDelete: true,
  canModerate: false,
  canInteract: true,
  author: { __typename: 'User', id: 'author', nickname: '작성자', avatar: null },
};

function cardTree({ ui }: { ui: ReactElement }) {
  const cache = new InMemoryCache();
  cache.writeFragment({ fragment: GalleryPostCardFragmentDoc, data: post });
  return <ApolloProvider client={new ApolloClient({ cache, link: new MockLink([]) })}>{ui}</ApolloProvider>;
}

function renderCard(ui: ReactElement) {
  return render(cardTree({ ui }));
}

describe('게시물 카드', () => {
  it('서버에서는 메뉴 버튼을 그리고 hydration 후 지정된 컨테이너에서 Enter로 열어야 한다', async () => {
    const ui = cardTree({ ui: <PostActionsMenu postId="post-1" /> });
    const container = document.body.appendChild(document.createElement('div'));
    container.id = APP_MAIN_ID;
    container.innerHTML = renderToString(ui);
    const trigger = within(container).getByRole('button', { name: '점심의 순간 더보기' });
    expect(trigger).toBeDisabled();
    expect(within(container).queryByRole('menu')).not.toBeInTheDocument();
    const root = await act(async () => hydrateRoot(container, ui));
    try {
      await waitFor(() => expect(trigger).toBeEnabled());
      const user = userEvent.setup();
      trigger.focus();
      await user.keyboard('{Enter}');
      expect(await screen.findByRole('menuitem', { name: '수정' })).toBeVisible();
      expect(container).toContainElement(screen.getByRole('menu'));
      await user.keyboard('{Escape}');
      await waitFor(() => expect(trigger).toHaveFocus());
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('멤버 카드는 제목·사진·본문과 메뉴·좋아요·댓글을 함께 보여줘야 한다', () => {
    renderCard(<PostCard id="post-1" />);
    const card = screen.getByRole('article', { name: '점심의 순간' });
    expect(within(card).getByRole('img', { name: '점심의 순간' })).toBeInTheDocument();
    expect(within(card).getByText('밥 먹다 웃은 순간')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: '점심의 순간 더보기' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: '점심의 순간 좋아요' })).toHaveTextContent('좋아요 2개');
    expect(within(card).getByRole('button', { name: '점심의 순간 댓글 1개' })).toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: '그룹 보기' })).not.toBeInTheDocument();
  });

  it('미리보기 카드는 반응 대신 그룹으로 안내해야 한다', () => {
    renderCard(<PostPreviewCard id="post-1" />);
    const card = screen.getByRole('article', { name: '점심의 순간' });
    expect(within(card).getByRole('img', { name: '점심의 순간' })).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: '그룹 보기' })).toHaveAttribute('href', '/groups/group-1');
    expect(within(card).queryByRole('button', { name: /좋아요|댓글|더보기/ })).not.toBeInTheDocument();
  });
});
