import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GalleryPostCardFragmentDoc,
  GroupContestSummaryFragmentDoc,
  MeDocument,
  Phase,
  type GroupContestSummaryFragment,
} from '@/shared/api/generated';
import { initAnalytics } from '@/shared/model/analytics';
import { resetAnalyticsClientForTest } from '@/shared/model/analytics/analytics.store';

import { COMMENT_POST, COMMENT_VIEWER } from '../../../../../test/fixtures/comment-composer.data';
import { GroupContestVoteButton } from './GroupContestVoteButton';

const amplitude = vi.hoisted(() => ({ init: vi.fn(), identify: vi.fn(), track: vi.fn() }));
vi.mock('@amplitude/analytics-browser', () => ({
  createInstance: () => amplitude,
  Identify: class {
    set() {
      return this;
    }
  },
}));

const contest: GroupContestSummaryFragment = {
  __typename: 'GroupContest',
  id: 'contest-1',
  groupId: 'group-1',
  title: '전송하지 않을 대회 제목',
  startsAt: '2026-11-01T00:00:00.000Z',
  submissionEndsAt: '2026-11-10T00:00:00.000Z',
  endsAt: '2026-11-15T00:00:00.000Z',
  likeLimit: 1,
  phase: Phase.Voting,
  isAdmin: false,
  canParticipate: false,
  canVote: true,
  votedPostId: null,
  entryCount: 2,
};

function renderVote(apiKey?: string) {
  initAnalytics({ apiKey, app: null });
  const requests: Array<{ succeed: () => void; fail: () => void }> = [];
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(
      () =>
        new Observable((sink) => {
          requests.push({
            succeed: () => {
              sink.next({
                data: { castGroupContestVote: { ...contest, canVote: false, votedPostId: COMMENT_POST.id } },
              });
              sink.complete();
            },
            fail: () => sink.error(new Error('투표 실패')),
          });
        }),
    ),
  });
  client.writeQuery({ query: MeDocument, data: { me: COMMENT_VIEWER } });
  client.writeFragment({ fragment: GroupContestSummaryFragmentDoc, data: contest });
  client.writeFragment({
    fragment: GalleryPostCardFragmentDoc,
    data: { ...COMMENT_POST, author: { ...COMMENT_VIEWER, id: 'another-member' } },
  });
  render(
    <ApolloProvider client={client}>
      <GroupContestVoteButton contestId={contest.id} postId={COMMENT_POST.id} />
    </ApolloProvider>,
  );
  return {
    user: userEvent.setup(),
    button: screen.getByRole('button', { name: `${COMMENT_POST.title} 대회 투표` }),
    requests,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAnalyticsClientForTest();
});
afterEach(() => resetAnalyticsClientForTest());

describe('GroupContestVoteButton 성공 이벤트', () => {
  it.each([true, false])('키 사용=%s일 때 서버 성공 뒤에만 대회 ID를 한 번 보내야 한다', async (enabled) => {
    const { user, button, requests } = renderVote(enabled ? 'test-key' : undefined);
    await user.click(button);
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(amplitude.track).not.toHaveBeenCalled();
    await user.click(button);
    expect(requests).toHaveLength(1);
    await act(async () => requests[0]?.succeed());
    await waitFor(() => expect(button).toHaveTextContent('내가 투표한 참여작'));
    if (!enabled) {
      expect(amplitude.init).not.toHaveBeenCalled();
      expect(amplitude.track).not.toHaveBeenCalled();
      return;
    }
    expect(amplitude.track).toHaveBeenCalledExactlyOnceWith('vote_cast', { contest_id: 'contest-1' });
  });

  it('투표 실패에는 이벤트를 보내지 않고 재시도 성공만 기록해야 한다', async () => {
    const { user, button, requests } = renderVote('test-key');
    await user.click(button);
    await waitFor(() => expect(requests).toHaveLength(1));
    await act(async () => requests[0]?.fail());
    await waitFor(() => expect(button).not.toHaveAttribute('aria-busy'));
    expect(amplitude.track).not.toHaveBeenCalled();
    await user.click(button);
    await waitFor(() => expect(requests).toHaveLength(2));
    await act(async () => requests[1]?.succeed());
    await waitFor(() =>
      expect(amplitude.track).toHaveBeenCalledExactlyOnceWith('vote_cast', {
        contest_id: 'contest-1',
      }),
    );
  });
});
