import type { InMemoryCache } from '@apollo/client';
import { within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  GalleryDocument,
  GroupContestDocument,
  GroupContestResultsDocument,
  GroupRole,
  GroupVisibility,
  Phase,
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

/** 라우트가 공개 그룹 대회에서 항상 사전 조회하는 그룹·대회 정보 */
function seedCompletedContest(cache: InMemoryCache) {
  cache.writeQuery({
    query: GalleryDocument,
    variables: { id: 'group-1' },
    data: {
      group: {
        __typename: 'Group',
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
        id: 'contest-1',
        groupId: 'group-1',
        title: '가을 웃음 대회',
        startsAt: '2026-10-01T00:00:00.000Z',
        submissionEndsAt: '2026-10-10T00:00:00.000Z',
        endsAt: '2026-10-15T00:00:00.000Z',
        phase: Phase.Completed,
        isAdmin: false,
        canParticipate: false,
        canVote: false,
        votedPostId: null,
        entryCount: 0,
      },
    },
  });
}
const respondEmptyResults = (name: string) =>
  name === 'GroupContestResults' ? { groupContestResults: [] } : {};

describe('종료된 그룹 대회의 결과 SSR·hydration', () => {
  it('사전 조회하지 않은 결과는 서버에서 건너뛰고 hydration 뒤 브라우저에서 받아야 한다', async () => {
    const server = createServerClient(seedCompletedContest);
    const ui = <GroupContestPageTemplate id="contest-1" groupId="group-1" />;
    const { html, errors } = await renderOnServer(server, ui);
    expect(errors).toEqual([]);
    expect(html).toContain('가을 웃음 대회');
    expect(html).not.toContain('참여작이 없는 대회예요');

    const browser = createBrowserClient(server, respondEmptyResults);
    const view = await hydrateOnClient(html, browser.client, ui);
    try {
      expect(await within(view.container).findByText('참여작이 없는 대회예요')).toBeVisible();
      expect(browser.operations).toEqual(['GroupContestResults']);
      expect(view.recoverableErrors).toEqual([]);
    } finally {
      view.unmount();
    }
  });

  it('라우트가 결과를 사전 조회했으면 서버 HTML에 결과를 그리고 다시 요청하지 않아야 한다', async () => {
    const server = createServerClient((cache) => {
      seedCompletedContest(cache);
      cache.writeQuery({
        query: GroupContestResultsDocument,
        variables: { contestId: 'contest-1' },
        data: { groupContestResults: [] },
      });
    });
    const ui = <GroupContestPageTemplate id="contest-1" groupId="group-1" resultsPreloaded />;
    const { html, errors } = await renderOnServer(server, ui);
    expect(errors).toEqual([]);
    expect(html).toContain('참여작이 없는 대회예요');

    const browser = createBrowserClient(server, respondEmptyResults);
    const view = await hydrateOnClient(html, browser.client, ui);
    try {
      expect(within(view.container).getByText('참여작이 없는 대회예요')).toBeVisible();
      expect(browser.operations).toEqual([]);
      expect(view.recoverableErrors).toEqual([]);
    } finally {
      view.unmount();
    }
  });
});
