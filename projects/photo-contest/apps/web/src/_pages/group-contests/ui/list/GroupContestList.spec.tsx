import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  GroupContestFilter,
  GroupContestsDocument,
  Phase,
  type GroupContestCardFragment,
} from '@/shared/api/generated';

import { GroupContestList } from './GroupContestList';

const contest = (id: string, phase: Phase): GroupContestCardFragment => ({
  __typename: 'GroupContest',
  id,
  groupId: 'group-1',
  title: `대회 ${id}`,
  likeLimit: 3,
  startsAt: '2026-10-01T00:00:00.000Z',
  submissionEndsAt: '2026-10-10T00:00:00.000Z',
  endsAt: '2026-10-20T00:00:00.000Z',
  phase,
  isAdmin: false,
  canParticipate: false,
  canVote: false,
  votedPostId: null,
  entryCount: 0,
  winners: [],
});

async function setup(filter: GroupContestFilter, contests: GroupContestCardFragment[]) {
  const link = new MockLink([
    {
      request: {
        query: GroupContestsDocument,
        variables: { groupId: 'group-1', filter, offset: 0, limit: 24 },
      },
      result: {
        data: { groupContestsPage: { __typename: 'GroupContestPage', items: contests, nextOffset: null } },
      },
    },
  ]);
  await act(async () => {
    render(
      <ApolloProvider client={new ApolloClient({ cache: new InMemoryCache(), link })}>
        <GroupContestList
          groupId="group-1"
          filter={filter}
          empty={<p>대회가 없어요</p>}
          renderContest={(id) => <p>카드 {id}</p>}
        />
      </ApolloProvider>,
    );
  });
}

describe('그룹 대회 목록', () => {
  it('화면이 넘긴 필터로 조회하고 대회마다 화면의 카드를 그려야 한다', async () => {
    await setup(GroupContestFilter.Active, [contest('a', Phase.Submission), contest('b', Phase.Voting)]);
    expect(await screen.findByText('카드 a')).toBeVisible();
    expect(screen.getByText('카드 b')).toBeVisible();
    expect(screen.queryByText('대회가 없어요')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '대회 더 보기' })).not.toBeInTheDocument();
  });

  it('대회가 없으면 화면이 넘긴 빈 안내를 보여 줘야 한다', async () => {
    await setup(GroupContestFilter.Completed, []);
    expect(await screen.findByText('대회가 없어요')).toBeVisible();
  });
});
