import { ApolloProvider } from '@apollo/client/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GalleryDocument, GroupRole, GroupVisibility } from '@/shared/api/generated';

import { createBrowserClient, createServerClient } from '../../../../test/support/ssr-hydration';
import { GroupPageTemplate } from './GroupPageTemplate';

vi.mock('next/navigation', () => ({
  usePathname: () => '/groups/private-group',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

describe('비공개 그룹 가입 승인 확인', () => {
  it('신청자가 승인 상태를 다시 받으면 안내를 닫고 같은 화면에 게시물 영역과 글쓰기를 보여야 한다', async () => {
    const pending = {
      __typename: 'Group' as const,
      id: 'private-group',
      name: '비공개 웃음',
      description: '',
      avatarUrl: null,
      coverUrl: null,
      visibility: GroupVisibility.Private,
      role: null,
      memberCount: 1,
      canViewPosts: false,
      joinRequestPending: true,
      inviteToken: null,
      members: [],
      categories: [],
    };
    const server = createServerClient((cache) =>
      cache.writeQuery({ query: GalleryDocument, variables: { id: pending.id }, data: { group: pending } }),
    );
    const browser = createBrowserClient(server, (name) => {
      if (name === 'Gallery')
        return {
          group: {
            ...pending,
            role: GroupRole.Member,
            memberCount: 2,
            canViewPosts: true,
            joinRequestPending: false,
          },
        };
      if (name === 'Me') return { me: null };
      if (name === 'NotificationUnreadCount') return { notificationUnreadCount: 0 };
      if (name === 'GalleryPosts') return { galleryPosts: [] };
      return {};
    });
    render(
      <ApolloProvider client={browser.client}>
        <GroupPageTemplate id={pending.id} />
      </ApolloProvider>,
    );
    expect(await screen.findByRole('region', { name: '비공개 그룹 안내' })).toBeVisible();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '승인 상태 확인' }));
    });
    expect(await screen.findByRole('region', { name: '최신 게시물' })).toBeVisible();
    expect(await screen.findByText('첫 사진을 올려보세요')).toBeVisible();
    expect(screen.getByRole('link', { name: '글쓰기' })).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('region', { name: '비공개 그룹 안내' })).toBeNull());
    expect(browser.operations).toContain('Gallery');
  });
});
