import type { ReactElement } from 'react';

import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  GroupContestCardFragmentDoc,
  Phase,
  PostKind,
  type GroupContestCardFragment,
} from '@/shared/api/generated';

import { CompletedGroupContestCard } from './CompletedGroupContestCard';
import { GroupContestCard } from './GroupContestCard';

const contest: GroupContestCardFragment = {
  __typename: 'GroupContest',
  id: 'contest-1',
  groupId: 'group-1',
  title: '가을 웃음 대회',
  likeLimit: 3,
  startsAt: '2026-10-01T00:00:00.000Z',
  submissionEndsAt: '2026-10-10T00:00:00.000Z',
  endsAt: '2026-10-20T00:00:00.000Z',
  phase: Phase.Completed,
  isAdmin: false,
  canParticipate: false,
  canVote: false,
  votedPostId: null,
  entryCount: 4,
  winners: [
    {
      __typename: 'GroupContestResult',
      rank: 1,
      voteCount: 7,
      winner: true,
      post: {
        __typename: 'GalleryPost',
        id: 'post-1',
        contestId: 'contest-1',
        groupId: 'group-1',
        groupName: '웃음 그룹',
        title: '낙엽에 미끄러진 순간',
        body: '',
        kind: PostKind.Photo,
        mediaUrl: '/backend/media/upload-1',
        mediaWidth: null,
        mediaHeight: null,
        linkUrl: null,
        createdAt: '2026-10-05T00:00:00.000Z',
        likeCount: 7,
        commentCount: 0,
        likedByMe: false,
        canDelete: false,
        canModerate: false,
        canInteract: true,
        category: null,
        contest: null,
        author: { __typename: 'User', id: 'author', nickname: '작성자', avatar: null },
      },
    },
  ],
};

function renderCard(ui: ReactElement, data: GroupContestCardFragment = contest) {
  const cache = new InMemoryCache();
  cache.writeFragment({ fragment: GroupContestCardFragmentDoc, fragmentName: 'GroupContestCard', data });
  return render(
    <ApolloProvider client={new ApolloClient({ cache, link: new MockLink([]) })}>{ui}</ApolloProvider>,
  );
}

describe('그룹 대회 카드', () => {
  it('진행 중 카드는 접수 마감과 참여 안내를 보여 주고 우승작을 그리지 않아야 한다', () => {
    renderCard(<GroupContestCard id="contest-1" />);
    const card = screen.getByRole('article', { name: '가을 웃음 대회' });
    expect(within(card).getByText('참여작 4개')).toBeVisible();
    expect(within(card).getByText(/^접수 마감 /)).toBeVisible();
    expect(within(card).getByText('사진도 동영상도, 나만의 웃긴 순간으로 참여해 보세요.')).toBeVisible();
    expect(within(card).getByRole('link', { name: '대회 둘러보기' })).toHaveAttribute(
      'href',
      '/groups/group-1/contests/contest-1',
    );
    expect(within(card).queryByRole('region', { name: '가을 웃음 대회 우승작' })).not.toBeInTheDocument();
  });

  it('지난 대회 카드는 종료 시각과 우승작의 순위·득표수·게시물 링크를 보여 줘야 한다', () => {
    renderCard(<CompletedGroupContestCard id="contest-1" />);
    const card = screen.getByRole('article', { name: '가을 웃음 대회' });
    expect(within(card).getByText(/^종료 /)).toBeVisible();
    const winners = within(card).getByRole('region', { name: '가을 웃음 대회 우승작' });
    const winner = within(winners).getByRole('link', { name: /낙엽에 미끄러진 순간/ });
    expect(winner).toHaveAttribute('href', '/groups/group-1/contests/contest-1#post-post-1');
    expect(within(winner).getByText('7표')).toBeVisible();
    expect(within(winner).getByText('1')).toBeVisible();
    expect(within(card).getByRole('link', { name: '대회 결과 보기' })).toHaveAttribute(
      'href',
      '/groups/group-1/contests/contest-1',
    );
  });

  it('우승작이 없는 지난 대회는 빈 안내를 보여 줘야 한다', () => {
    renderCard(<CompletedGroupContestCard id="contest-1" />, { ...contest, winners: [] });
    expect(screen.getByText('투표로 선정된 우승작이 없어요.')).toBeVisible();
  });
});
