import type { InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  GalleryDocument,
  GalleryPostsDocument,
  GroupContestDocument,
  GroupRole,
  GroupVisibility,
  MeDocument,
  Phase,
  PostSort,
} from '@/shared/api/generated';

import {
  createBrowserClient,
  createServerClient,
  hydrateOnClient,
  renderOnServer,
} from '../../../../test/support/ssr-hydration';
import { GroupContestPageTemplate } from './GroupContestPageTemplate';

vi.mock('next/navigation', () => ({
  usePathname: () => '/groups/group-1/contests/contest-1',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

describe('진행 중인 그룹 대회 회귀', () => {
  it('참여 게시물 목록은 홈 피드의 제목·빈 안내 대신 대회 문구를 보여줘야 한다', async () => {
    // 라우트는 공개 그룹의 진행 중 대회에서 그룹·대회·참여 게시물을 사전 조회한다.
    const server = createServerClient((cache) => {
      cache.writeQuery({
        query: GalleryDocument,
        variables: { id: 'group-1' },
        data: {
          group: {
            __typename: 'Group',
            description: '',
            avatarUrl: null,
            coverUrl: null,
            id: 'group-1',
            name: '공개 웃음',
            visibility: GroupVisibility.Public,
            role: GroupRole.Member,
            memberCount: 2,
            canViewPosts: true,
            joinRequestPending: false,
            inviteToken: null,
            members: [],
            categories: [],
          },
        },
      });
      cache.writeQuery({
        query: GroupContestDocument,
        variables: { id: 'contest-1' },
        data: {
          groupContest: {
            __typename: 'GroupContest',
            likeLimit: 1,
            id: 'contest-1',
            groupId: 'group-1',
            title: '가을 웃음 대회',
            startsAt: '2026-10-01T00:00:00.000Z',
            submissionEndsAt: '2026-10-30T00:00:00.000Z',
            endsAt: '2026-11-05T00:00:00.000Z',
            phase: Phase.Submission,
            isAdmin: false,
            canParticipate: true,
            canVote: false,
            votedPostId: null,
            entryCount: 0,
          },
        },
      });
      cache.writeQuery({
        query: GalleryPostsDocument,
        variables: {
          groupId: 'group-1',
          contestId: 'contest-1',
          sort: PostSort.Newest,
          offset: 0,
          limit: 24,
        },
        data: { galleryPosts: [] },
      });
    });
    const ui = <GroupContestPageTemplate id="contest-1" groupId="group-1" />;
    const { html, errors } = await renderOnServer(server, ui);
    expect(errors).toEqual([]);

    // 상단바의 알림 버튼만 브라우저에서 보는 사람을 조회한다.
    const browser = createBrowserClient(server, (name) => (name === 'Me' ? { me: null } : {}));
    const view = await hydrateOnClient(html, browser.client, ui);
    try {
      const entries = within(view.container).getByRole('region', { name: '참여 게시물' });
      expect(within(entries).getByText('아직 대회에 참여한 게시물이 없어요')).toBeVisible();
      expect(within(view.container).queryByRole('region', { name: '최신 게시물' })).not.toBeInTheDocument();
      expect(within(view.container).queryByText('첫 사진을 올려보세요')).not.toBeInTheDocument();
      expect(browser.operations).toEqual(['Me']);
      expect(view.recoverableErrors).toEqual([]);
    } finally {
      view.unmount();
    }
  });
});

function seedOpenContest(cache: InMemoryCache) {
  cache.writeQuery({
    query: GalleryDocument,
    variables: { id: 'group-1' },
    data: {
      group: {
        __typename: 'Group',
        description: '',
        avatarUrl: null,
        coverUrl: null,
        id: 'group-1',
        name: '공개 웃음',
        visibility: GroupVisibility.Public,
        role: null,
        memberCount: 2,
        canViewPosts: true,
        joinRequestPending: false,
        inviteToken: null,
        members: [],
        categories: [],
      },
    },
  });
  cache.writeQuery({
    query: GroupContestDocument,
    variables: { id: 'contest-1' },
    data: {
      groupContest: {
        __typename: 'GroupContest',
        likeLimit: 1,
        id: 'contest-1',
        groupId: 'group-1',
        title: '가을 웃음 대회',
        startsAt: '2026-10-01T00:00:00.000Z',
        submissionEndsAt: '2026-10-10T00:00:00.000Z',
        endsAt: '2026-10-15T00:00:00.000Z',
        phase: Phase.Submission,
        isAdmin: false,
        canParticipate: false,
        canVote: false,
        votedPostId: null,
        entryCount: 0,
      },
    },
  });
}
describe('public group membership in the contest', () => {
  it('shows the write link after joining without leaving the contest', async () => {
    const server = createServerClient((cache) => {
      seedOpenContest(cache);
      cache.writeQuery({
        query: MeDocument,
        data: {
          me: {
            __typename: 'User',
            id: 'viewer',
            nickname: 'viewer',
            avatar: null,
            isAnonymous: false,
            needsOnboarding: false,
          },
        },
      });
    });
    const before = server.cache.readQuery({ query: GalleryDocument, variables: { id: 'group-1' } });
    const contest = server.cache.readQuery({ query: GroupContestDocument, variables: { id: 'contest-1' } });
    if (!before || !contest) throw new Error('Missing contest fixture');
    const group = { ...before.group, role: GroupRole.Member, memberCount: 3 };
    const browser = createBrowserClient(server, (name) => {
      if (name === 'RequestGroupMembership') return { requestGroupMembership: group };
      if (name === 'Gallery') return { group };
      if (name === 'GroupContest') return { groupContest: { ...contest.groupContest, canParticipate: true } };
      if (name === 'NotificationUnreadCount') return { notificationUnreadCount: 0 };
      if (name === 'GalleryPosts') return { galleryPosts: [] };
      if (name === 'Me') return { me: server.cache.readQuery({ query: MeDocument })?.me };
      return {};
    });
    render(
      <ApolloProvider client={browser.client}>
        <GroupContestPageTemplate id="contest-1" groupId="group-1" />
      </ApolloProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: '그룹 가입하기' }));
    const write = await screen.findByRole('link', { name: '글쓰기' });
    expect(write).toHaveAttribute('href', '/groups/group-1/write?contestId=contest-1');
    expect(browser.operations).toContain('GroupContest');
  });
});
